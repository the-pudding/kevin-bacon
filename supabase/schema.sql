-- Run once in the Supabase SQL editor (or `supabase db push`) for the
-- project backing PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_PUBLISHABLE_KEY.
--
-- Records the three reader interactions (src/components/scrolly/
-- GuessRank.svelte, PairQuiz.svelte and ActorSearch.svelte). Write-only from
-- the client: no
-- select/update/delete policy is granted to `anon`, so the publishable key
-- can only append rows.
--
-- The one read path is the `quiz_results` function in quiz_results.sql (a
-- security definer aggregate behind these policies, for the credits' results
-- charts). Run that file after this one.

create table rank_guesses (
	id uuid primary key default gen_random_uuid(),
	session_id uuid not null,
	actor_id integer, -- null when gave_up is true
	gave_up boolean not null default false,
	correct boolean, -- actor_id ranks #1 (closest to the center of Hollywood); always false for a give-up; null for guesses recorded before this column existed
	created_at timestamptz not null default now()
);

create table pair_quiz_picks (
	id uuid primary key default gen_random_uuid(),
	session_id uuid not null,
	pair_index integer not null,
	picked_id integer not null,
	other_id integer not null,
	correct boolean, -- picked_id is actually closer to the center of Hollywood; null for picks recorded before this column existed
	created_at timestamptz not null default now()
);

-- The reader's own actor, searched on the hop chart or one of the three
-- scatters. One row per pick rather than one per reader: the same actor named
-- again on a later chart is a second row, because `chart` is half of what this
-- is measuring.
create table actor_searches (
	id uuid primary key default gen_random_uuid(),
	session_id uuid not null,
	actor_id integer not null,
	chart text not null, -- hops | remoteness | costars | career
	created_at timestamptz not null default now()
);

alter table rank_guesses enable row level security;
alter table pair_quiz_picks enable row level security;
alter table actor_searches enable row level security;

create policy "anon insert only" on rank_guesses
	for insert to anon with check (true);
create policy "anon insert only" on pair_quiz_picks
	for insert to anon with check (true);
create policy "anon insert only" on actor_searches
	for insert to anon with check (true);
