// Story-mode dialogue — a real pre-fight and post-fight exchange for every
// rung of STORY_LADDER (lib/story.ts), keyed by the opponent's characterId
// since each ladder fight has a unique one. Written from the ladder
// opponent's point of view (their bio/introLines/title are the established
// voice reference — see lib/characters.ts) with a generic-but-in-character
// protagonist reply, since the player's own fighter can be any of the 18
// roster picks and the dialogue needs to read naturally regardless of
// which one they chose. `speaker: "player"` lines are rendered under
// whichever character the player actually picked (see StoryCutscene.tsx).
//
// Viraat and Overmog — the two real bosses — get longer exchanges with
// actual narrative weight (drawing on lib/lore.ts's Mogsphere mythology)
// and a `postLose` reaction, since a loss to a boss should land
// differently than a loss to a regular ladder rung.

export interface DialogueLine {
  speaker: "player" | "opponent" | "narrator";
  text: string;
}

export interface FightDialogue {
  pre: DialogueLine[];
  postWin: DialogueLine[];
  postLose?: DialogueLine[];
}

export const STORY_DIALOGUE: Record<string, FightDialogue> = {
  chandan: {
    pre: [
      { speaker: "opponent", text: "Oh, a new face on the ladder. I was getting bored of the regulars." },
      { speaker: "player", text: "You talk this much before every fight?" },
      { speaker: "opponent", text: "I talk this much DURING every fight. You just won't be able to keep up enough to notice." },
    ],
    postWin: [
      { speaker: "opponent", text: "...huh. Okay. Didn't see that coming." },
      { speaker: "opponent", text: "Don't get used to it. Next time I won't waste breath talking." },
    ],
  },
  ryan: {
    pre: [
      { speaker: "opponent", text: "Chandan tapped out already? Figures. He never could close a fight." },
      { speaker: "player", text: "You're not going to give me a speech too, are you?" },
      { speaker: "opponent", text: "No. I'm going to pick you up and put you back down. That's the whole speech." },
    ],
    postWin: [
      { speaker: "opponent", text: "Down you go." },
      { speaker: "opponent", text: "Whoever's next on this ladder better bring more than that." },
    ],
  },
  elango: {
    pre: [
      { speaker: "opponent", text: "I heard you went through Ryan without slowing down." },
      { speaker: "opponent", text: "Good. I've been patient long enough — patient's a compliment, by the way. Not everyone gets it." },
      { speaker: "player", text: "So what happens when you stop being patient?" },
      { speaker: "opponent", text: "The ground finds out first. You're about to." },
    ],
    postWin: [
      { speaker: "opponent", text: "...huh. The ground didn't remember that one." },
      { speaker: "opponent", text: "Go on, then. Climb higher. See how much further patience gets you." },
    ],
  },
  dev: {
    pre: [
      { speaker: "opponent", text: "I've already run this matchup four hundred times in simulation." },
      { speaker: "player", text: "And?" },
      { speaker: "opponent", text: "Three hundred and ninety of them, I win. I brought backups for the other ten." },
      { speaker: "player", text: "Sounds like you should've simmed a few more." },
    ],
    postWin: [
      { speaker: "opponent", text: "That's — that's not in any of the branches I modeled." },
      { speaker: "opponent", text: "Running it again. Don't get comfortable — I learn fast." },
    ],
  },
  rishi: {
    pre: [
      { speaker: "opponent", text: "..." },
      { speaker: "player", text: "Not much of a talker, huh." },
      { speaker: "opponent", text: "One cut is enough. Talking is for people who need a second one." },
      { speaker: "player", text: "Bold, for someone who hasn't landed the first yet." },
    ],
    postWin: [
      { speaker: "opponent", text: "...draw your weapon next time. I'll wait." },
      { speaker: "opponent", text: "That's the most words I've said all week. Don't let it go to your head." },
    ],
  },
  ronith: {
    pre: [
      { speaker: "opponent", text: "You're fast enough to reach me. Question is whether you're fast enough to hit me." },
      { speaker: "player", text: "There's only one way to find out." },
      { speaker: "opponent", text: "There's always a way to find out. Most people just don't survive the answer." },
    ],
    postWin: [
      { speaker: "opponent", text: "...you actually landed one. I felt that." },
      { speaker: "opponent", text: "Fine. You've earned the right to keep climbing. Don't waste it." },
    ],
  },
  tej: {
    pre: [
      { speaker: "opponent", text: "Ronith lost? To you? Huh. Okay, I'm a little more interested now." },
      { speaker: "opponent", text: "I'm too fast to block and too impatient to combo. Doesn't leave you a lot of options." },
      { speaker: "player", text: "Then I guess I'll have to be the exception." },
    ],
    postWin: [
      { speaker: "opponent", text: "Huh. Wasn't bored for once." },
      { speaker: "opponent", text: "You're about to meet Viraat. Try to still be standing when you do." },
    ],
  },

  // --- Viraat — mid-ladder gatekeeper, one of the twelve, isStoryBoss ---
  viraat: {
    pre: [
      { speaker: "narrator", text: "The ladder ends in a room without walls — just a throne made of the same void every fighter's own ring is cut from." },
      { speaker: "opponent", text: "You made it further than most. That's not nothing." },
      { speaker: "player", text: "You built all of this. Why fight your own arena?" },
      { speaker: "opponent", text: "Because letting people through unchallenged isn't a gift, it's an insult. Everyone ends up here eventually." },
      { speaker: "opponent", text: "Let's see what you've actually learned on the way down." },
    ],
    postWin: [
      { speaker: "opponent", text: "...good. Genuinely. I built this place to find out who could actually do this, not just talk about it." },
      { speaker: "opponent", text: "But I'm not what's waiting past me. I only ever built the door. I didn't build what's behind it." },
      { speaker: "narrator", text: "The void throne dims, and for the first time, Viraat looks like he's the one who's afraid." },
    ],
    postLose: [
      { speaker: "opponent", text: "Not yet, then. Go again — I'd rather you were ready than fast." },
    ],
  },

  // --- Overmog — the true final boss, not a thirteenth friend ---
  overmog: {
    pre: [
      { speaker: "narrator", text: "Past Viraat's throne, the Mogsphere stops looking like anyone's ring at all." },
      { speaker: "narrator", text: "What's waiting isn't wearing a face. It's wearing all twelve, at once, and none of them fit." },
      { speaker: "opponent", text: "There is no leaderboard here." },
      { speaker: "player", text: "What ARE you?" },
      { speaker: "opponent", text: "I am what's left when everyone stops pretending. Every ego this place has ever fed on, for years, with nowhere to go." },
      { speaker: "opponent", text: "You already lost the moment you started counting wins." },
      { speaker: "narrator", text: "The arena doesn't cheer for this one. It just watches." },
    ],
    postWin: [
      { speaker: "narrator", text: "The prismatic light doesn't shatter so much as exhale — twelve years of borrowed ego finally let go all at once." },
      { speaker: "opponent", text: "...oh. That's what that feels like." },
      { speaker: "narrator", text: "For one second, before the light fades entirely, it almost sounds relieved." },
      { speaker: "player", text: "It's over." },
      { speaker: "narrator", text: "Viraat built the arena. Everyone else just had to survive it — and someone finally did." },
    ],
    postLose: [
      { speaker: "opponent", text: "You already lost the moment you started counting wins." },
      { speaker: "narrator", text: "The ring resets. It always does. It's patient — it has had years of practice." },
    ],
  },
};
