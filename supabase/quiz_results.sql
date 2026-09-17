-- Crowd histograms for the two reader quizzes, plus the caller's own numbers.
-- Re-runnable: unlike schema.sql (run-once DDL), this is `create or replace`.
--
-- `security definer` because rank_guesses / pair_quiz_picks stay insert-only to
-- `anon` (see schema.sql): this is the ONLY read path, and it emits aggregates
-- plus the one session the caller names. Passing someone else's session id
-- returns their two numbers — an unguessable v4 UUID holding no PII and no
-- cross-session join key, so the exposure is a non-issue, noted here so it
-- reads as a decision rather than an oversight.
--
-- Story data (the SLJ node id, the pair count) arrives as arguments: this repo
-- keeps that in src/data/*.json, not in the database.
--
-- Counting rules, and what forces each one:
--
--   Rank bucket = count(DISTINCT actor_id) over the rows at or before the first
--   correct one, floored at 1. GuessRank.pick() inserts on every pick but
--   story.rankGuesses splices a repeat out and re-pushes it, so the count the
--   reader lived through is deduped by actor and this must dedupe the same way.
--   It also absorbs a mid-chapter reload, which re-runs guesses under the same
--   session id. The created_at clip keeps a post-solve stray row from inflating
--   the count; note that created_at is INSERT order, not click order, since
--   analytics.js's writes are fire-and-forget over independent requests.
--
--   Solved beats gave-up. A session with both is a solver.
--
--   A session with neither a correct row nor a give-up row never finished, so
--   it is not a data point and must not dilute the denominator.
--
--   Legacy rank_guesses.correct IS NULL is recoverable: "correct" there means
--   exactly "this actor is SLJ", so p_slj_actor_id reconstructs it. Called with
--   p_slj_actor_id => null the fallback is simply off.
--
--   Pair score takes the FIRST row per (session_id, pair_index). A re-answer
--   happens after the cards have flown onto the scatter and shown the true
--   answer, so the second pick is contaminated. `id` makes the tiebreak
--   deterministic when two rows share a timestamp.
--
--   Legacy pair_quiz_picks.correct IS NULL is NOT recoverable — scoring needs
--   the rank comparison, which lives in src/data/scrolly-nodes.json and not
--   here. Those sessions drop out whole. Counting null as wrong would
--   manufacture a spike at the low scores.
--
-- Two different statistics come back, and the difference is deliberate:
--   better_than_pct — strictly better, self-EXCLUDED (denominator takers - 1).
--     "Better than Y% of readers" is a claim about other people, and ties are
--     excluded so everyone on a score gets the same honest number.
--   company_pct — same-outcome share, self-INCLUDED (denominator takers).
--     "So did Z% of readers" is a descriptive share the reader is part of.
-- Give-ups count as worse than any finite guess count, which is what makes the
-- give-up bar the right-hand end of an ordered axis rather than an "other".

create or replace function public.quiz_results(
	p_session_id uuid default null,
	p_pair_count integer default 5,
	p_slj_actor_id integer default null,
	-- must be >= 2, or generate_series(1, p_max_guess_bucket - 1) is empty and
	-- the "1 guess" bucket disappears
	p_max_guess_bucket integer default 5
)
returns jsonb
language sql
stable
security definer
-- mandatory on a security definer function (Supabase's
-- function_search_path_mutable lint), which is why every table below is
-- public.-qualified: drop a qualification and this breaks at call time, not at
-- create time
set search_path = ''
as $$
with
-- -- A: the rank guess at SLJ ------------------------------------------------
scored as (
	select
		g.session_id,
		g.actor_id,
		g.gave_up,
		g.created_at,
		(
			g.correct is true
			or (
				g.correct is null
				and p_slj_actor_id is not null
				and g.actor_id = p_slj_actor_id
			)
		) as is_slj
	from public.rank_guesses g
),
outcome as (
	select
		s.session_id,
		min(s.created_at) filter (where s.is_slj) as solved_at,
		bool_or(s.gave_up) as gave_up
	from scored s
	group by s.session_id
),
rank_session as (
	select
		o.session_id,
		case when o.solved_at is not null then 'solved' else 'gave_up' end as outcome,
		greatest(
			count(distinct s.actor_id) filter (
				where s.actor_id is not null
					and o.solved_at is not null
					and s.created_at <= o.solved_at
			),
			1
		) as guesses
	from outcome o
	join scored s on s.session_id = o.session_id
	where o.solved_at is not null or o.gave_up
	group by o.session_id, o.solved_at, o.gave_up
),
rank_labels as (
	select i::text as bucket, i as ord
	from generate_series(1, p_max_guess_bucket - 1) as i
	union all select p_max_guess_bucket::text || '+', p_max_guess_bucket
	union all select 'gave_up', p_max_guess_bucket + 1
),
rank_bucketed as (
	select
		r.session_id,
		case
			when r.outcome = 'gave_up' then 'gave_up'
			when r.guesses >= p_max_guess_bucket then p_max_guess_bucket::text || '+'
			else r.guesses::text
		end as bucket
	from rank_session r
),
rank_hist as (
	select l.bucket, l.ord, count(b.session_id) as n
	from rank_labels l
	left join rank_bucketed b on b.bucket = l.bucket
	group by l.bucket, l.ord
),
rank_total as (select count(*)::int as takers from rank_session),
rank_me as (select * from rank_session where session_id = p_session_id),
rank_you as (
	select
		m.outcome,
		case when m.outcome = 'solved' then m.guesses end as guesses,
		case when m.outcome = 'solved' then
			100.0 * (
				select count(*)
				from rank_session r
				where r.session_id <> m.session_id
					and (r.outcome = 'gave_up' or r.guesses > m.guesses)
			) / nullif((select takers from rank_total) - 1, 0)
		end as better_than_pct,
		case when m.outcome = 'gave_up' then
			100.0 * (select count(*) from rank_session r where r.outcome = 'gave_up')
			/ nullif((select takers from rank_total), 0)
		end as company_pct
	from rank_me m
),
-- -- B: the pair quiz --------------------------------------------------------
pair_first as (
	select distinct on (p.session_id, p.pair_index)
		p.session_id, p.pair_index, p.correct
	from public.pair_quiz_picks p
	-- QUIZ_PAIRS is derived at build time (src/components/scrolly/layouts/
	-- scatters.js); if that data or its filter shifts, a stale-shaped session
	-- drops out here rather than being silently mis-scored
	where p.pair_index >= 0 and p.pair_index < p_pair_count
	order by p.session_id, p.pair_index, p.created_at, p.id
),
pair_session as (
	select
		f.session_id,
		sum((f.correct is true)::int)::int as score
	from pair_first f
	group by f.session_id
	having count(*) = p_pair_count and bool_and(f.correct is not null)
),
pair_hist as (
	select l.score, count(s.session_id) as n
	from generate_series(0, p_pair_count) as l(score)
	left join pair_session s on s.score = l.score
	group by l.score
),
pair_total as (select count(*)::int as takers from pair_session),
pair_me as (select * from pair_session where session_id = p_session_id),
pair_you as (
	select
		m.score,
		case when m.score > 0 then
			100.0 * (
				select count(*)
				from pair_session p
				where p.session_id <> m.session_id and p.score < m.score
			) / nullif((select takers from pair_total) - 1, 0)
		end as better_than_pct,
		case when m.score = 0 then
			100.0 * (select count(*) from pair_session p where p.score = 0)
			/ nullif((select takers from pair_total), 0)
		end as company_pct
	from pair_me m
)
-- `you` comes back as JSON null whenever the session has no qualifying rows (a
-- scalar subquery over no rows), which is the signal the component reads
select jsonb_build_object(
	'pair_count', p_pair_count,
	'rank', jsonb_build_object(
		'takers', (select takers from rank_total),
		'buckets', (
			select jsonb_agg(jsonb_build_object('key', bucket, 'count', n) order by ord)
			from rank_hist
		),
		'you', (
			select jsonb_build_object(
				'outcome', outcome,
				'guesses', guesses,
				'better_than_pct', better_than_pct,
				'company_pct', company_pct
			) from rank_you
		)
	),
	'pairs', jsonb_build_object(
		'takers', (select takers from pair_total),
		'buckets', (
			select jsonb_agg(
				jsonb_build_object('key', score::text, 'score', score, 'count', n)
				order by score
			)
			from pair_hist
		),
		'you', (
			select jsonb_build_object(
				'score', score,
				'better_than_pct', better_than_pct,
				'company_pct', company_pct
			) from pair_you
		)
	)
);
$$;

-- per-signature, so a later argument change needs an explicit
-- `drop function public.quiz_results(uuid, integer, integer, integer)` (create
-- or replace cannot change an argument list) and these two lines re-run
revoke all on function public.quiz_results(uuid, integer, integer, integer) from public;
grant execute on function public.quiz_results(uuid, integer, integer, integer) to anon, authenticated;

-- both CTEs group by session_id over a full scan otherwise; the second index is
-- also exactly the `distinct on` sort key, which turns that node into an index
-- scan
create index if not exists rank_guesses_session_idx
	on public.rank_guesses (session_id);
create index if not exists pair_quiz_picks_session_idx
	on public.pair_quiz_picks (session_id, pair_index, created_at);

-- without this the first .rpc() call fails with PGRST202 "not found in the
-- schema cache", which looks for all the world like a missing grant
notify pgrst, 'reload schema';
