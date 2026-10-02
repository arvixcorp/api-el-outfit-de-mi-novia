import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client.js";
import { env } from "../config/env.js";

const adapter = new PrismaMariaDb(env.DATABASE_URL);

export const prisma = new PrismaClient({ adapter });
