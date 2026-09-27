export const MINOR_SUITS = ['wands', 'cups', 'swords', 'pentacles'] as const;
export type MinorSuit = (typeof MINOR_SUITS)[number];
export const MINOR_RANKS = [
  'Ace',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Page',
  'Knight',
  'Queen',
  'King',
] as const;

// Each card has its own reflective meaning; reversals describe tensions, not predictions.
const meanings: Record<MinorSuit, [string, string, string][]> = {
  wands: [
    [
      'A spark of interest is worth exploring through one small creative action.',
      'Give a new idea room to develop before forcing enthusiasm or a quick result.',
      'inspiration,initiative,potential',
    ],
    [
      'Consider the wider possibilities and make a practical plan for your next step.',
      'Name the uncertainty keeping you on the threshold and test one option gently.',
      'planning,possibility,perspective',
    ],
    [
      'Look beyond the first milestone and allow patient effort to open new possibilities.',
      'Revisit expectations and adjust your approach when progress is slower than hoped.',
      'expansion,foresight,patience',
    ],
    [
      'A shared milestone or welcoming space can help you appreciate the support around you.',
      'Notice what would make your home, community or celebration feel more secure and inclusive.',
      'belonging,celebration,stability',
    ],
    [
      'Different viewpoints may compete for attention; clear ground rules can turn friction into useful exchange.',
      'Address lingering tension directly rather than suppressing it or treating every difference as a contest.',
      'friction,challenge,dialogue',
    ],
    [
      'Acknowledge progress and accept recognition while remembering those who helped you.',
      'Measure progress by your values instead of relying entirely on outside approval.',
      'recognition,confidence,progress',
    ],
    [
      'Stand by a considered position while choosing carefully which challenges deserve your energy.',
      'Protect your capacity and reconsider whether every disagreement needs a response.',
      'conviction,boundaries,perseverance',
    ],
    [
      'When momentum increases, clear communication helps you act with purpose.',
      'Check timing and messages before rushing; a delay may reveal what needs coordination.',
      'momentum,communication,timing',
    ],
    [
      'Experience can help you persist, especially when you combine determination with rest and boundaries.',
      'Distinguish useful caution from constant defensiveness and accept support before exhaustion grows.',
      'resilience,vigilance,endurance',
    ],
    [
      'Review your responsibilities and decide what can be shared, simplified or put down.',
      'Release obligations that no longer belong to you and ask for practical help.',
      'responsibility,burden,priorities',
    ],
    [
      'Approach an unfamiliar creative possibility with curiosity and a willingness to learn.',
      'Ground scattered enthusiasm in one modest experiment before making larger promises.',
      'curiosity,exploration,enthusiasm',
    ],
    [
      'Let courage and energy move an idea forward with a clear purpose.',
      'Slow impulsive commitments and choose a pace that you can sustain.',
      'adventure,drive,courage',
    ],
    [
      'Express your warmth and confidence while making space for your own creative voice.',
      'Reconnect with your confidence without comparing yourself to someone else or hiding your needs.',
      'confidence,warmth,independence',
    ],
    [
      'Bring a clear vision to practical leadership and invite others to contribute.',
      'Check whether urgency or pride is making your leadership less flexible or attentive.',
      'vision,leadership,initiative',
    ],
  ],
  cups: [
    [
      'Make room for an honest feeling, a caring connection or a fresh source of creativity.',
      'Tend to your emotional capacity before offering more than you can comfortably give.',
      'openness,care,renewal',
    ],
    [
      'Mutual respect and an honest exchange can deepen a connection or partnership.',
      'Notice unequal effort or unspoken expectations and invite a clear conversation.',
      'partnership,reciprocity,connection',
    ],
    [
      'Shared joy and supportive friendships can remind you that you do not have to do everything alone.',
      'Consider whether a social circle nourishes you and whether your boundaries need attention.',
      'friendship,celebration,community',
    ],
    [
      'A quiet pause can help you understand dissatisfaction and notice an overlooked possibility.',
      'Gently re-engage with an opportunity when you are ready, without denying your feelings.',
      'reflection,discontent,awareness',
    ],
    [
      'Acknowledge disappointment while allowing yourself to notice the support that remains.',
      'Healing may begin with accepting what happened and taking a small step toward reconnection.',
      'grief,acceptance,perspective',
    ],
    [
      'A kind memory or familiar connection can help you recognise what still matters to you.',
      'Learn from the past without expecting the present to recreate it exactly.',
      'memory,kindness,familiarity',
    ],
    [
      'Many possibilities invite imagination; compare them with evidence before choosing.',
      'Reduce distracting options and identify the choice that fits your real needs.',
      'possibility,imagination,discernment',
    ],
    [
      'Consider whether leaving an unfulfilling pattern would make room for a more meaningful direction.',
      'Explore what makes leaving difficult and whether renewed effort or a boundary is more appropriate.',
      'searching,release,meaning',
    ],
    [
      'Appreciate a source of contentment and recognise the effort that helped you reach it.',
      'Look beneath appearances of success to understand what would feel satisfying to you.',
      'contentment,gratitude,satisfaction',
    ],
    [
      'Shared care and values can strengthen a sense of emotional belonging.',
      'Allow real relationships to be imperfect and discuss needs beneath an ideal picture of harmony.',
      'belonging,harmony,shared-values',
    ],
    [
      'Listen to a tender feeling or unexpected creative thought with curiosity.',
      'Give feelings a clear expression while checking assumptions and keeping healthy boundaries.',
      'sensitivity,curiosity,creativity',
    ],
    [
      'Bring sincere feeling and imagination to a conversation, invitation or creative pursuit.',
      'Balance an appealing ideal with follow-through and realistic expectations.',
      'sincerity,imagination,invitation',
    ],
    [
      'Compassion and attentive listening can help you understand a feeling without being overwhelmed by it.',
      'Care for your own emotional boundaries as thoughtfully as you care for others.',
      'compassion,empathy,attunement',
    ],
    [
      'Respond to strong feelings with steadiness, empathy and thoughtful boundaries.',
      'Pause before reacting and seek support when emotions are difficult to manage alone.',
      'steadiness,compassion,maturity',
    ],
  ],
  swords: [
    [
      'A clear question or honest insight can help you cut through confusion.',
      'Check your reasoning and clarify your message before drawing a firm conclusion.',
      'clarity,truth,discernment',
    ],
    [
      'A difficult choice asks for balanced attention to facts, feelings and missing information.',
      'Identify the decision you are postponing and seek the information needed to address it.',
      'decision,balance,uncertainty',
    ],
    [
      'Name a painful truth with care and allow time and support for emotional repair.',
      'Make space for recovery without pressuring yourself to dismiss hurt before you are ready.',
      'hurt,honesty,healing',
    ],
    [
      'A deliberate period of rest can help you recover perspective before acting.',
      'Notice when exhaustion calls for rest or when a long pause is ready to become gentle action.',
      'rest,recovery,stillness',
    ],
    [
      'Consider the human cost of a conflict and whether winning would serve what matters.',
      'An honest repair or a clear boundary may be more useful than continuing an unproductive contest.',
      'conflict,consequences,repair',
    ],
    [
      'A gradual transition may help you move toward a calmer or more workable situation.',
      'Acknowledge unfinished concerns and seek support for a change that feels difficult.',
      'transition,support,perspective',
    ],
    [
      'Use discretion and strategy while examining whether your actions align with your values.',
      'Clarify assumptions and choose accountability rather than avoiding a difficult conversation.',
      'strategy,discretion,integrity',
    ],
    [
      'Distinguish real constraints from assumptions and identify one choice still available to you.',
      'Question a limiting belief and accept help as you begin to recover a sense of agency.',
      'restriction,beliefs,agency',
    ],
    [
      'Treat anxious thoughts with compassion and check them against what you actually know.',
      'Share a persistent worry with someone trustworthy and allow support to interrupt isolation.',
      'worry,compassion,perspective',
    ],
    [
      'Acknowledge that a difficult phase may need closure; this image is symbolic, not a prediction of harm.',
      'Recovery can begin with releasing a painful pattern and taking one manageable next step.',
      'closure,recovery,release',
    ],
    [
      'Ask thoughtful questions and verify information before deciding what to believe.',
      'Slow reactive messages and distinguish useful curiosity from suspicion or scattered attention.',
      'curiosity,inquiry,alertness',
    ],
    [
      'Focused effort and direct communication can help you address a clear challenge.',
      'Check facts and consequences before letting urgency turn into haste or needless conflict.',
      'resolve,directness,momentum',
    ],
    [
      'Combine clear judgement with honest boundaries and respect for other perspectives.',
      'Notice whether hurt is making your judgement unusually harsh toward yourself or others.',
      'discernment,boundaries,honesty',
    ],
    [
      'Apply careful reasoning and fair standards while remaining accountable for your decisions.',
      'Question rigid certainty and make room for evidence and empathy alongside authority.',
      'reason,fairness,judgement',
    ],
  ],
  pentacles: [
    [
      'A practical opportunity can grow through steady attention and a realistic first step.',
      'Review the resources and preparation an opportunity needs before committing to it.',
      'opportunity,resources,grounding',
    ],
    [
      'Flexible priorities can help you balance changing demands and limited resources.',
      'Simplify competing commitments and build a rhythm that leaves room for rest.',
      'balance,adaptability,priorities',
    ],
    [
      'Collaboration and patient practice can bring different skills together into useful work.',
      'Clarify roles, expectations and feedback where teamwork feels disconnected.',
      'craft,teamwork,learning',
    ],
    [
      'Consider how to protect what supports you while leaving room for generosity and change.',
      'Examine whether fear of loss is making it difficult to share, adapt or let go.',
      'security,stewardship,control',
    ],
    [
      'Acknowledge a period of strain and look for practical support you do not have to earn alone.',
      'Small steps toward assistance and connection may ease a sense of being shut out.',
      'hardship,support,belonging',
    ],
    [
      'Giving and receiving work best when needs, boundaries and power are considered fairly.',
      'Notice unequal exchanges or obligations attached to help and discuss clearer terms.',
      'generosity,reciprocity,fairness',
    ],
    [
      'Pause to assess what your effort is growing and whether patient investment still fits your goals.',
      'Reconsider where you spend energy when effort and reward no longer feel aligned.',
      'patience,evaluation,cultivation',
    ],
    [
      'Consistent practice and attention to detail can deepen a skill one step at a time.',
      'Adjust a perfectionist or repetitive routine so learning remains meaningful and sustainable.',
      'practice,craft,commitment',
    ],
    [
      'Recognise the independence and comfort supported by your work, care and boundaries.',
      'Check whether an image of self-sufficiency is hiding a need for connection or support.',
      'independence,comfort,appreciation',
    ],
    [
      'Think about the shared resources, relationships and traditions you want to sustain over time.',
      'Discuss expectations around belonging or resources rather than assuming everyone shares the same values.',
      'continuity,community,legacy',
    ],
    [
      'Turn curiosity into a practical learning plan and a small task you can complete.',
      'Choose one manageable habit instead of waiting for ideal motivation or conditions.',
      'learning,practice,potential',
    ],
    [
      'Steady, dependable effort can move a realistic plan forward.',
      'Review whether a useful routine has become inflexible or whether consistency needs rebuilding.',
      'reliability,patience,effort',
    ],
    [
      'Practical care can create a supportive environment for yourself and the people around you.',
      'Protect time and resources for your own needs as well as those of others.',
      'care,grounding,resourcefulness',
    ],
    [
      'Use experience and resources responsibly to support lasting, practical stability.',
      'Examine whether status, possessiveness or overwork is displacing the wellbeing you meant to build.',
      'stewardship,stability,experience',
    ],
  ],
};

export const MINOR_ARCANA = MINOR_SUITS.flatMap((suit) =>
  meanings[suit].map(([upright, reversed, keywords], index) => ({
    name: `${MINOR_RANKS[index]} of ${suit[0].toUpperCase()}${suit.slice(1)}`,
    numeral: MINOR_RANKS[index],
    group: suit,
    upright,
    reversed,
    keywords: keywords.split(','),
  })),
);
