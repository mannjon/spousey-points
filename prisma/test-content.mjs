// TEST CONTENT — coded into the project on purpose (dev rule, Jonathan 2026-11-05:
// "Any test content must be coded into the app or project").
//
// This fixture is the ONLY source of test data for local/dev checks. Nothing is
// seeded by hand into a database. Run it against a LOCAL database only:
//
//   DATABASE_URL=postgresql://... node prisma/test-content.mjs
//
// It wipes and recreates one throwaway household (id "test-household"):
//   TestAdult / TestPartner (adults), TestChild (child)
//   TestAdult password: test-content-pass
//   Two normal rewards for TestAdult (cost 15 and 50), one for TestChild (20),
//   one AVAILABLE special offer for TestAdult ("Test Special", +150 points).
// Delete this file and the test household when the test content is not wanted.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// bcrypt hash of "test-content-pass" (bcryptjs, cost 10), verified at creation.
const PASSWORD_HASH =
  "$2a$10$5Xh0l/9JDBnOp/ajMXd9ZOf/EkFOvZ9IO2T8Tf3Eq7tBttph1.Ge.";

const HOUSEHOLD_ID = "test-household";
const ADULT_ID = "test-user-adult";
const PARTNER_ID = "test-user-partner";
const CHILD_ID = "test-child";

async function main() {
  // Hard guard: this fixture only ever runs against a local database.
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("localhost") && !url.includes("127.0.0.1")) {
    console.error("Refusing to run: DATABASE_URL does not point at a local database.");
    process.exit(1);
  }

  // Cascade removes the household's users, child, rewards and special offers.
  await prisma.household.deleteMany({ where: { id: HOUSEHOLD_ID } });

  await prisma.household.create({ data: { id: HOUSEHOLD_ID } });

  await prisma.user.create({
    data: {
      id: ADULT_ID,
      screenName: "TestAdult",
      passwordHash: PASSWORD_HASH,
      householdId: HOUSEHOLD_ID,
      points: 100,
      tokens: 0,
      version: "SPOUSEY",
    },
  });
  await prisma.user.create({
    data: {
      id: PARTNER_ID,
      screenName: "TestPartner",
      passwordHash: PASSWORD_HASH,
      householdId: HOUSEHOLD_ID,
      points: 100,
      tokens: 0,
      version: "SPOUSEY",
    },
  });
  await prisma.child.create({
    data: { id: CHILD_ID, householdId: HOUSEHOLD_ID, name: "TestChild", tokens: 100 },
  });

  await prisma.reward.create({
    data: {
      id: "test-reward-a",
      householdId: HOUSEHOLD_ID,
      ownerUserId: ADULT_ID,
      createdById: ADULT_ID,
      title: "Test Reward A",
      cost: 15,
      kind: "PERSONAL",
      audience: "SELF",
      saved: true,
      status: "ACTIVE",
    },
  });
  await prisma.reward.create({
    data: {
      id: "test-reward-b",
      householdId: HOUSEHOLD_ID,
      ownerUserId: ADULT_ID,
      createdById: ADULT_ID,
      title: "Test Reward B",
      cost: 50,
      kind: "PERSONAL",
      audience: "SELF",
      saved: true,
      status: "ACTIVE",
    },
  });
  await prisma.reward.create({
    data: {
      id: "test-reward-child",
      householdId: HOUSEHOLD_ID,
      ownerChildId: CHILD_ID,
      createdById: ADULT_ID,
      title: "Test Reward Child",
      cost: 20,
      kind: "PERSONAL",
      audience: "SELF",
      saved: true,
      status: "ACTIVE",
    },
  });

  await prisma.specialOffer.create({
    data: {
      id: "test-special",
      householdId: HOUSEHOLD_ID,
      ownerUserId: ADULT_ID,
      title: "Test Special",
      effect: "POINTS",
      amount: 150,
      bundle: [],
      status: "AVAILABLE",
    },
  });

  console.log("Test content ready: household", HOUSEHOLD_ID);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
