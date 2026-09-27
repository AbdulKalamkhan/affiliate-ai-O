// Compare-and-swap helper.
//
// WHY THIS EXISTS
//
// Prisma's `update` with a NON-unique `where` filter throws
// `PrismaClientKnownRequestError` code `P2025` when the filter matches no row.
// It does NOT return null. (Verified against Prisma 6.19.3, the version pinned in
// packages/database.)
//
// The automation queue's concurrency safety rests entirely on that behaviour: a
// worker claims a job with `where: { id, status: "queued" }`, and if another
// worker got there first the filter matches nothing, so the claim must fail.
//
// The code was written against a test double that returned `null` on no-match,
// so every `if (!updated) continue` guard downstream was unreachable in
// production while looking perfectly exercised by a green suite. In real
// production a lost CAS race raised P2025, which propagated out of the claim
// loop and aborted the ENTIRE batch — silently starving the queue instead of
// skipping one already-claimed job.
//
// `casUpdate` makes the intended semantics explicit and real: a lost race is a
// normal, expected outcome that yields `null`, and the fake DB is aligned to
// throw P2025 so the tests exercise the same path production does.

/**
 * True when a Prisma error means "the filter matched no row".
 *
 * Matched STRUCTURALLY on `code === "P2025"` rather than with `instanceof`.
 * `instanceof PrismaClientKnownRequestError` silently fails when the error
 * crossed a module boundary, came from a differently-instantiated Prisma client,
 * or — as in the test double — was constructed to mimic the shape. A structural
 * check also survives a Prisma upgrade that moves the class.
 */
export const isRecordNotFound = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as { code?: unknown }).code === "P2025";

/**
 * Run a Prisma `update` as a compare-and-swap.
 *
 * Returns the updated row, or `null` when the `where` filter matched nothing —
 * which for a CAS means another actor won the race. Genuine errors (constraint
 * violations, connectivity) still propagate.
 */
export async function casUpdate<T>(
  run: () => Promise<T>,
): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    if (isRecordNotFound(error)) return null;
    throw error;
  }
}
