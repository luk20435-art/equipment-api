import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { DbService } from '../common/db.service';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private supabaseService: DbService,
  ) {}

  async login(email: string, password: string) {
    // Get user by email
    const result = await this.supabaseService.getUserByEmail(email);

    if (result.error || !result.data) {
      throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }

    const user = result.data;

    // Verify password
    const isPasswordValid = await bcrypt.compare(
      password,
      user.password_hash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }

    // Generate JWT token
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const token = this.jwtService.sign(payload);

    // Return user data (without password) and token
    const { password_hash, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      token,
    };
  }

  async validateUser(userId: string) {
    const result = await this.supabaseService.getUserById(userId);

    if (result.error || !result.data) {
      return null;
    }

    const { password_hash, ...userWithoutPassword } = result.data;
    return userWithoutPassword;
  }

  async register(data: {
    email: string;
    password: string;
    name: string;
    role: string;
    department: string;
  }) {
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(data.password, salt);

    // Create user
    const result = await this.supabaseService.createUser({
      email: data.email,
      password_hash,
      name: data.name,
      role: data.role,
      department: data.department,
    });

    if (result.error) {
      throw new Error(result.error.message);
    }

    const { password_hash: _, ...userWithoutPassword } = result.data;
    return userWithoutPassword;
  }
}
