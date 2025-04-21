import pkg from "fast-levenshtein";
const { get: levenshteinDistance } = pkg;

/**
 * Finds the closest command ID to the target string from a list of possibilities
 * using the Levenshtein distance algorithm.
 *
 * @param target - The input to find a close match for
 * @param possibilities - Array of possible matches
 * @returns The closest match, or empty string if no good match found
 */
const closest = (target: string, possibilities: string[]): string => {
  if (possibilities.length === 0) return "";

  // Normalize the target input to use colons for consistent comparison
  const normalizedTarget = target.replaceAll(' ', ':');

  const distances = possibilities.map((id) => ({
    distance: levenshteinDistance(normalizedTarget, id, { useCollator: true }),
    id,
  }));

  distances.sort((a, b) => a.distance - b.distance);

  const closestMatch = distances[0];
  if (!closestMatch) return "";

  // Use threshold based on word length
  const threshold = Math.max(1, Math.floor(normalizedTarget.length / 2));
  const maxDistance = 3; // Maximum acceptable distance

  if (closestMatch.distance <= Math.min(threshold, maxDistance)) {
    return closestMatch.id;
  }

  return ""; // No suggestion found within threshold
};

// Add named export for compatibility
export { closest };

// Also add default export
export default closest;
