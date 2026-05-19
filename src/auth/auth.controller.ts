import { Controller, Post, Body, Get, UseGuards, Request, Req, Res, ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { Response, Request as ExpressRequest } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private readonly loginAttempts = new Map<string, { count: number; resetAt: number }>();

  private checkRateLimit(ip: string) {
    const now = Date.now();
    const entry = this.loginAttempts.get(ip);
    if (entry && now < entry.resetAt) {
      if (entry.count >= RATE_LIMIT) {
        throw new HttpException('ลองเข้าสู่ระบบใหม่หลัง 1 นาที', HttpStatus.TOO_MANY_REQUESTS);
      }
      entry.count++;
    } else {
      this.loginAttempts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
      if (this.loginAttempts.size > 5000) {
        for (const [key, val] of this.loginAttempts) {
          if (Date.now() > val.resetAt) this.loginAttempts.delete(key);
        }
      }
    }
  }

  private clearRateLimit(ip: string) {
    this.loginAttempts.delete(ip);
  }

  @Post('login')
  async login(
    @Body() body: { email: string; password: string },
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip ?? 'unknown';
    this.checkRateLimit(ip);
    const result = await this.authService.login(body.email, body.password);
    this.clearRateLimit(ip);
    res.cookie('token', result.token, COOKIE_OPTS);
    return { user: result.user };
  }

  @Post('dev-login')
  async devLogin(
    @Body() body: { email: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Not available in production');
    }
    const result = await this.authService.devLogin(body.email);
    res.cookie('token', result.token, COOKIE_OPTS);
    return { user: result.user };
  }

  @Post('register')
  async register(
    @Body() body: { email: string; password: string; name: string; role: string; department: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(body);
    res.cookie('token', result.token, COOKIE_OPTS);
    return { user: result.user };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('token', { path: '/' });
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@Request() req: ExpressRequest & { user: any }) {
    return req.user;
  }
}
