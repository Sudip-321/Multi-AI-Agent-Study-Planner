import { NextResponse } from "next/server";
import { prisma } from "./prisma";

/** Local-first app: a single demo user. Upgradable to real auth later. */
export async function getUser() {
  const email = "student@cortexa.app";
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: { email, name: "Student", xp: 0, level: 1, streak: 0 }
    });
  }
  return user;
}

export function ok<T>(data: T, init?: number) {
  return NextResponse.json(data, { status: init ?? 200 });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function handle(fn: () => Promise<NextResponse>) {
  try {
    return await fn();
  } catch (err) {
    console.error("[api]", err);
    return fail(err instanceof Error ? err.message : "Unexpected error", 500);
  }
}
