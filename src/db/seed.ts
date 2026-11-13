import { connect } from "./connect";

/**
 * Loads sample data into the database at `url`. Must be safe to run more than once.
 * The first login user arrives with auth (M0); sample business data with M1.
 */
export async function seed(url: string): Promise<void> {
  const db = connect(url);
  try {
    console.log("Nothing to seed yet.");
  } finally {
    await db.$client.end();
  }
}
