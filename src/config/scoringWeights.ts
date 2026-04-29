/** Tunable point weights for the run-scoped life + scoring system. */
export const SCORING_WEIGHTS = {
  catEngagement: 30,
  humanEngagement: 10,
  cleanNight: 100,
  nightSurvived: 75,
  distancePerThousandPx: 5,
  territoryMax: 200,
  closeFriend: 150,
  dumpedPetComforted: 120,
  foodSourceDiscovered: 40,
} as const;
