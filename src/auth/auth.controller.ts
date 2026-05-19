import { Controller, Post, Body, Get, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  @Post('dev-login')
  async devLogin(@Body() body: { email: string }) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Not available in production');
    }
    return this.authService.devLogin(body.email);
  }

  @Post('register')
  async register(
    @Body()
    body: {
      email: string;
      password: string;
      name: string;
      role: string;
      department: string;
    },
  ) {
    return this.authService.register(body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@Request() req) {
    return req.user;
  }
}
