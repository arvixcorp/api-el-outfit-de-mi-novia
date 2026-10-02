import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma.js";
import { AppError, NotFoundError, UnauthorizedError } from "../../common/errors/AppError.js";
import { generateRefreshToken, hashToken, signAccessToken } from "./tokens.js";
import type { LoginInput, RegisterInput, UpdateProfileInput } from "./auth.schemas.js";

const publicUser = {
  id: true,
  email: true,
  nombre: true,
  estiloPreferido: true,
  ciudad: true,
  createdAt: true,
} as const;

async function issueSession(user: { id: string; email: string }) {
  const refresh = generateRefreshToken();
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: refresh.hash, expiresAt: refresh.expiresAt },
  });
  return { accessToken: signAccessToken(user), refreshToken: refresh.token };
}

export const authService = {
  async register(input: RegisterInput) {
    const exists = await prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw new AppError("Ya existe una cuenta con ese email", 409, "EMAIL_TAKEN");

    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash: await bcrypt.hash(input.password, 10),
        nombre: input.nombre,
        estiloPreferido: input.estiloPreferido,
        ciudad: input.ciudad,
      },
      select: publicUser,
    });
    return { user, ...(await issueSession(user)) };
  },

  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    // Mismo mensaje para email inexistente y clave incorrecta (no revela cuentas).
    const valid = user && (await bcrypt.compare(input.password, user.passwordHash));
    if (!user || !valid) throw new UnauthorizedError("Email o contraseña incorrectos");

    const { passwordHash: _omit, ...safe } = user;
    return { user: safe, ...(await issueSession(user)) };
  },

  /** Rota el refresh token: el usado se revoca y se entrega uno nuevo. */
  async refresh(token: string) {
    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: publicUser } },
    });
    if (!stored) throw new UnauthorizedError("Sesión inválida");

    if (stored.revokedAt) {
      // Reutilizar un token ya rotado indica robo: se cierran todas las sesiones.
      await prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedError("Sesión inválida");
    }
    if (stored.expiresAt < new Date()) throw new UnauthorizedError("Sesión expirada");

    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    return { user: stored.user, ...(await issueSession(stored.user)) };
  },

  async logout(token: string) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  async me(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: publicUser });
    if (!user) throw new NotFoundError("Usuaria no encontrada");
    return user;
  },

  async updateProfile(userId: string, input: UpdateProfileInput) {
    return prisma.user.update({ where: { id: userId }, data: input, select: publicUser });
  },
};
