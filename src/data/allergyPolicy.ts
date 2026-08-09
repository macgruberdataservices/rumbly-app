// Shared contract version for every app surface that can expose Disney's
// allergy-friendly menu labels. Keep this module platform-neutral so the
// off-app Ask Rumbly validation harness can emit the same versioned gate.
// Increment whenever the acknowledgement meaning or filtering contract
// changes. The saved record contains no selected allergens or health data;
// the UI still asks once per app session.
export const ALLERGY_ACKNOWLEDGEMENT_VERSION = 1;
