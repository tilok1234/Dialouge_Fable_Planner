// Contextual field guide — the right-hand help panel.
//
// Explains what belongs in each field of the artifact being edited, distilled
// from the schemas' own doc comments and the quarry reference sample. The
// guide is the missing manual: the schemas know exactly what each field is
// for, but that knowledge lived only in code comments until now.

interface FieldHelp {
  name: string;
  what: string;
  example?: string;
}

interface Guide {
  title: string;
  intro: string;
  fields: FieldHelp[];
}

const GUIDES: Record<string, Guide> = {
  canon: {
    title: "Canon facts",
    intro:
      "Canon facts are the objective truths of your world — everything else references them by id. The AI can never change canon; during generation it can only PROPOSE new facts, which land in your proposals inbox for approval.",
    fields: [
      { name: "Label", what: "Short human name for the fact, used in lists." },
      {
        name: "Statement",
        what: "The truth itself, written in-world, one or two sentences. This exact text reaches the writer when the fact is permitted in a scene.",
        example: "“The quarry golem was built by the miners themselves to atone for the over-dig.”",
      },
      {
        name: "Veracity",
        what: "objective-truth = non-negotiable history/physics. established-fact = true, could gain nuance later. world-rule = how the world works (magic, law).",
      },
      {
        name: "Visibility",
        what: "Who could plausibly know it: public, known-to-faction, known-to-few, or secret. A character shouldn't casually know a secret fact — keep their knowledge buckets consistent with this.",
      },
      { name: "References", what: "Other fact ids this one depends on or refines." },
      { name: "Tags", what: "Retrieval keywords the context compiler can use." },
    ],
  },

  faction: {
    title: "Faction",
    intro:
      "A faction gives its members a shared worldview and — most usefully — a shared way of SPEAKING. Characters inherit the faction's metaphor domain and terminology unless their own voice overrides it.",
    fields: [
      { name: "Name / summary", what: "The identity pitch: who they are in one breath." },
      { name: "Shared beliefs", what: "Canon fact ids most members hold true. Grounds what any member takes for granted in dialogue." },
      {
        name: "Metaphor domain source",
        what: "Where the faction's figurative language comes from. This is the single strongest voice lever in the whole system — a member reaches for these images under pressure.",
        example: "stone, weight, erosion, debt (the Stoneborn) → “Your name will erode before this vein remembers it.”",
      },
      { name: "Customs", what: "Greeting rituals, forms of address, hospitality rules — anything that colors the opening and closing of a conversation." },
      { name: "Taboos", what: "What members will NOT say or do. The review pass flags dialogue that violates them." },
    ],
  },

  character: {
    title: "Character profile",
    intro:
      "The profile is PERMANENT identity — who they are across the entire game. What changes moment to moment (mood, injuries, boss phase) lives in States, never here. Profile changes should be deliberate character arcs.",
    fields: [
      {
        name: "Gameplay role vs narrative function",
        what: "Role = mechanical job (boss, merchant, quest-giver). Function = storytelling job (mislead the player, deliver emotional relief, represent a faction's worldview). They often differ — that difference is depth.",
      },
      {
        name: "Public reputation vs private reality",
        what: "What the world believes about them vs what is actually true. The gap between these two lines is where drama comes from.",
        example: "Reputation: “A monument that walks; none who wake it return.” Reality: “A guardian built to atone for a theft it cannot forgive.”",
      },
      {
        name: "Core (desire, fear, value, flaw, contradiction, boundary)",
        what: "Deliberately short and strongly prioritized — NOT a pile of adjectives. The central contradiction generates more coherent dialogue than twenty traits ever will. The moral boundary is what they refuse to do even at cost.",
        example: "Contradiction: “Made by the very hands it now judges.”",
      },
      {
        name: "Knowledge (six buckets)",
        what: "knows = can state truthfully. believesFalse = will sincerely say the wrong thing. suspects = will hedge. secrets = knows but conceals (may reveal deliberately). lies = willfully misstates. unknown = cannot even hint. Generation warns if a scene requires a fact no participant knows.",
      },
      {
        name: "Voice — sample lines",
        what: "Canonical examples of how they sound. The strongest consistency lever: the model imitates register, rhythm, and vocabulary from these. Two or three good ones beat ten mediocre ones.",
      },
      {
        name: "Voice — anti-sample lines",
        what: "How they must NEVER sound. This is what suppresses generic fantasy voice. Write the line a lazy writer would produce.",
        example: "“Foolish mortal! You dare challenge my power?”",
      },
      {
        name: "Pressure",
        what: "How they behave under specific conditions — defeated, cornered, offered a bribe. Each entry is condition → emotion → behaviour, and steers the matching scenes.",
        example: "defeated → weary acknowledgement → “Refuses to beg; names the vein one last time.”",
      },
    ],
  },

  state: {
    title: "Character state",
    intro:
      "A state is the character RIGHT NOW. One profile, many states: pre-encounter, phase two, defeated, post-quest. Scenes pick which state speaks — same soul, different moment.",
    fields: [
      { name: "Mood", what: "Current emotional posture, concrete and playable.", example: "“offended, escalating” — not just “angry”." },
      { name: "Location / injuries / phase", what: "The physical situation. Phase is for boss stages (phase-one, final-phase) so combat states stay distinct." },
      { name: "Recent events", what: "What they just witnessed. Directly colors the next lines — the writer references these." },
      { name: "Temporary objective", what: "A short-term goal that overrides the profile's primary desire for this state only." },
      {
        name: "Facts learned",
        what: "Canon facts picked up during play. Extends what the character may say in this state beyond their profile knowledge — the knowledge check counts these.",
      },
      { name: "Promises / unresolved conflicts", what: "Open threads the writer can pull on. A promise made in stage 1 can be honoured or broken in stage 5." },
    ],
  },

  quest: {
    title: "Quest",
    intro:
      "The quest is a state machine that GATES INFORMATION. Its per-stage reveal schedule is what the knowledge validators check scenes against — a scene bound to stage 1 cannot require a fact revealed at stage 3.",
    fields: [
      { name: "Premise", what: "What the quest is about and why the player would care, one paragraph." },
      {
        name: "Stages",
        what: "Ordered steps. Entry/completion/failure conditions are natural language in v1. The crucial field is factsRevealedToPlayer — the reveal schedule everything else is validated against.",
      },
      { name: "Transitions", what: "Which stage ids can follow this one. The playthrough simulator walks these to find dead ends." },
      {
        name: "Choices",
        what: "Player decisions. Each names its resulting stage, its consequences, and which characters' relationships shift because of it.",
      },
      { name: "Character knowledge", what: "What each participating character knows within this quest — keeps NPCs from spoiling each other's secrets." },
    ],
  },

  scene: {
    title: "Scene specification",
    intro:
      "The scene spec is the steering input for generation: who talks, what MUST come out, what stays hidden, how it should feel, and how long it may run. When you hit Generate, the context compiler resolves everything referenced here.",
    fields: [
      { name: "Scene type", what: "The template category (boss-first-encounter, npc-rumour, quest-offer…). Sets the reviewer's expectations for shape and tone." },
      {
        name: "Participants",
        what: "Who is present: character id + state id (WHICH version of them is talking — the wounded golem, not the calm one) + role (speaker, interlocutor).",
      },
      { name: "Purpose", what: "The single sentence saying why this scene exists. The beat plan is built around delivering it." },
      {
        name: "Required facts",
        what: "Fact ids that MUST be conveyed. Generation warns you if no participant actually knows one of them (check their knowledge buckets and state factsLearned).",
      },
      { name: "Hintable facts", what: "May be alluded to but not confirmed. Foreshadowing lives here." },
      {
        name: "Forbidden revelations",
        what: "MUST NOT come out — not stated, not paraphrased, not implied. Enforced three ways: prompt rules, the deterministic id gate, and the AI review pass hunting for semantic leaks.",
      },
      {
        name: "Emotional progression",
        what: "The ordered arc of the exchange. Each beat gets an emotion; the drafted lines follow the sequence.",
        example: "controlled judgment → offended warning → dismissal",
      },
      { name: "Max length", what: "Hard cap band: single-line (20 words) up to long (320). The reviewer flags lines that bust the band." },
      {
        name: "Bound quest stages",
        what: "Ties the scene into the quest's reveal schedule — with this set, generation automatically checks you aren't requiring facts the player can't know yet.",
      },
    ],
  },

  generate: {
    title: "Generating a character",
    intro:
      "The brief is a creative prompt, not a form. Give the model a role, a texture, and a tension — the tension is what makes the profile worth keeping.",
    fields: [
      { name: "Role", what: "What they are in the game world: boss, quest-giver, merchant, hermit…" },
      { name: "Texture", what: "Two or three concrete adjectives or images that suggest a voice." },
      {
        name: "Tension",
        what: "A secret, contradiction, or wound. Profiles generated without one come out flat.",
        example: "“Blind lighthouse keeper on a drowned coast who talks to the tide; gentle, evasive about the shipwreck she caused.”",
      },
      { name: "ID slug", what: "Optional stable id (snake_case). Leave blank to derive one from the brief. Ids are forever once referenced." },
    ],
  },
};

interface Props {
  kind: string;
}

export function FieldGuide({ kind }: Props) {
  const guide = GUIDES[kind];
  if (!guide) return null;
  return (
    <aside
      style={{
        width: 330,
        flexShrink: 0,
        maxHeight: "calc(100vh - 120px)",
        overflowY: "auto",
        padding: "12px 16px",
        border: "1px solid var(--line, #2a2f3e)",
        borderRadius: 6,
        fontSize: 12,
        lineHeight: 1.55,
      }}
    >
      <h3 style={{ marginTop: 0 }}>{guide.title} — field guide</h3>
      <p className="hint">{guide.intro}</p>
      {guide.fields.map((f) => (
        <div key={f.name} style={{ marginBottom: 12 }}>
          <strong>{f.name}</strong>
          <div className="hint">{f.what}</div>
          {f.example && (
            <div style={{ marginTop: 3, paddingLeft: 8, borderLeft: "2px solid #4a5568", fontStyle: "italic" }} className="hint">
              {f.example}
            </div>
          )}
        </div>
      ))}
    </aside>
  );
}
