import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");
import { Agent, setGlobalDispatcher } from "undici";
setGlobalDispatcher(new Agent({ connect: { timeout: 30000 } }));

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL ausente.");
}

const sql = neon(databaseUrl);

const cases = [
  ["Bruce Wayne", "character"],
  ["Seth Cohen", "character"],
  ["Lucas Scott", "character"],
  ["Nathan Scott", "character"],
  ["Brooke Davis", "character"],
  ["Walter White", "character"],
  ["Neal Caffrey", "character"],
  ["Michael Scofield", "character"],
  ["Clark Kent", "character"],
  ["Christopher Nolan", "person"],
  ["Nolan", "person"],
  ["Henry Cavill", "person"],
  ["Cavill", "person"],
  ["Henri Cavill", "person"],
  ["Tom Holand", "person"],
];

function normalize(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

for (const [label, expected] of cases) {
  const query = normalize(label);
  const wordCount = query.split(/\s+/).length;

  const [people, characters] = await Promise.all([
    sql`SELECT * FROM search_v4_people(query_text := ${query}, result_limit := 120)`,
    sql`SELECT * FROM search_v4_characters(query_text := ${query}, result_limit := 120)`,
  ]);

  const person = [...(people || [])]
    .sort((a, b) => Number(b.entity_score) - Number(a.entity_score))[0];
  const character = [...(characters || [])]
    .sort((a, b) => Number(b.entity_score) - Number(a.entity_score))[0];

  const characterRelevant =
    character?.match_kind === "exact" &&
    Number(character.media_count || 0) >= 1 &&
    Number(character.max_media_popularity || 0) >= 5;

  const personStrong =
    Number(person?.media_count || 0) >= 8 ||
    Number(person?.important_credit_count || 0) >= 6;

  const personScore =
    Number(person?.entity_score || 0) +
    (person?.match_kind === "surname" && wordCount === 1 ? 120 : 0) -
    (characterRelevant && !personStrong ? 250 : 0);

  const characterScore =
    Number(character?.entity_score || 0) +
    (character?.match_kind === "exact" && wordCount > 1 ? 100 : 0);

  const winner = personScore > characterScore ? "person" : "character";
  const passed = winner === expected;

  console.log(`\nQUERY: ${label}`);
  console.log("BEST CHARACTER:", character ? {
    name: character.character_name,
    match: character.match_kind,
    mediaCount: character.media_count,
    maxMediaPopularity: character.max_media_popularity,
    final: Math.round(characterScore),
  } : null);
  console.log("BEST PERSON:", person ? {
    name: person.person_name,
    match: person.match_kind,
    mediaCount: person.media_count,
    importantCredits: person.important_credit_count,
    maxMediaPopularity: person.max_media_popularity,
    obscurePenalty: characterRelevant && !personStrong ? 250 : 0,
    final: Math.round(personScore),
  } : null);
  console.log(`WINNER: ${winner.toUpperCase()} ${passed ? "✓" : "✗"}`);

  if (!passed) process.exitCode = 1;
}
