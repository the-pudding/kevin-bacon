-- Run once in the Supabase SQL editor (or `supabase db push`) for the
-- project backing PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_PUBLISHABLE_KEY.
--
-- Records the two reader quiz interactions (src/components/scrolly/
-- GuessRank.svelte and PairQuiz.svelte). Write-only from the client: no
-- select/update/delete policy is granted to `anon`, so the publishable key
-- can only append rows.

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

alter table rank_guesses enable row level security;
alter table pair_quiz_picks enable row level security;

create policy "anon insert only" on rank_guesses
	for insert to anon with check (true);
create policy "anon insert only" on pair_quiz_picks
	for insert to anon with check (true);
