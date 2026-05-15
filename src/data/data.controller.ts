import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DataService } from './data.service';

@UseGuards(JwtAuthGuard)

@Controller()
export class DataController {
  constructor(private readonly dataService: DataService) {}

  // Stock Items
  @Get('stock-items')
  getStockItems(@Query('search') search?: string, @Query('category') category?: string) {
    return this.dataService.getStockItems({ search, category });
  }

  @Get('stock-items/next-code')
  getNextStockCode() {
    return this.dataService.getNextStockCode();
  }

  @Get('stock-items/:id')
  getStockItemById(@Param('id') id: string) {
    return this.dataService.getStockItemById(id);
  }

  @Post('stock-items')
  createStockItem(@Body() data: any) {
    return this.dataService.createStockItem(data);
  }

  @Put('stock-items/:id')
  updateStockItem(@Param('id') id: string, @Body() data: any) {
    return this.dataService.updateStockItem(id, data);
  }

  @Delete('stock-items/:id')
  deleteStockItem(@Param('id') id: string) {
    return this.dataService.deleteStockItem(id);
  }

  // Requisitions (เบิกสต็อก)
  @Get('requisitions')
  getRequisitions(@Query('status') status?: string, @Query('userId') userId?: string) {
    return this.dataService.getRequisitions({ status, userId });
  }

  @Post('requisitions')
  createRequisition(@Body() data: any) {
    return this.dataService.createRequisition(data);
  }

  @Put('requisitions/:id')
  updateRequisition(@Param('id') id: string, @Body() data: any) {
    return this.dataService.updateRequisition(id, data);
  }

  // Booking Returns
  @Get('booking-returns')
  getBookingReturns(@Query('status') status?: string, @Query('userId') userId?: string) {
    return this.dataService.getBookingReturns({ status, userId });
  }

  @Post('booking-returns')
  createBookingReturn(@Body() data: any) {
    return this.dataService.createBookingReturn(data);
  }

  @Put('booking-returns/:id')
  inspectBookingReturn(@Param('id') id: string, @Body() data: any) {
    return this.dataService.inspectBookingReturn(id, data);
  }

  // Brands
  @Get('brands')
  getBrands() {
    return this.dataService.getBrands();
  }

  @Post('brands')
  createBrand(@Body() data: any) {
    return this.dataService.createBrand(data);
  }

  @Put('brands/:id')
  updateBrand(@Param('id') id: string, @Body() data: any) {
    return this.dataService.updateBrand(id, data);
  }

  @Delete('brands/:id')
  deleteBrand(@Param('id') id: string) {
    return this.dataService.deleteBrand(id);
  }

  // Projects
  @Get('projects')
  getProjects(@Query('status') status?: string) {
    return this.dataService.getProjects({ status });
  }

  @Post('projects')
  createProject(@Body() data: any) {
    return this.dataService.createProject(data);
  }

  @Put('projects/:id')
  updateProject(@Param('id') id: string, @Body() data: any) {
    return this.dataService.updateProject(id, data);
  }

  // Dashboard
  @Get('dashboard/stats')
  getDashboardStats() {
    return this.dataService.getDashboardStats();
  }

  // Warehouses
  @Get('warehouses')
  getWarehouses() {
    return this.dataService.getWarehouses();
  }

  // Equipment Units
  @Get('equipment-units')
  getEquipmentUnits(@Query('equipmentId') equipmentId?: string) {
    return this.dataService.getEquipmentUnits({ equipmentId });
  }

  @Post('equipment-units')
  createEquipmentUnit(@Body() data: any) {
    return this.dataService.createEquipmentUnit(data);
  }

  @Put('equipment-units/:id')
  updateEquipmentUnit(@Param('id') id: string, @Body() data: any) {
    return this.dataService.updateEquipmentUnit(id, data);
  }

  @Delete('equipment-units/:id')
  deleteEquipmentUnit(@Param('id') id: string) {
    return this.dataService.deleteEquipmentUnit(id);
  }

  // Users
  @Get('users')
  getUsers() {
    return this.dataService.getUsers();
  }

  @Post('users')
  async createUser(@Body() body: { name: string; email: string; role: string; department?: string; password: string }) {
    if (!body.name || !body.email || !body.password) throw new BadRequestException('name, email and password are required');
    const password_hash = await bcrypt.hash(body.password, 10);
    return this.dataService.createUserAccount({ name: body.name, email: body.email, role: body.role ?? 'user', department: body.department, password_hash });
  }

  @Put('users/:id')
  updateUser(@Param('id') id: string, @Body() data: { name?: string; role?: string; department?: string; is_active?: boolean }) {
    return this.dataService.updateUserAccount(id, data);
  }

  @Delete('users/:id')
  deleteUser(@Param('id') id: string) {
    return this.dataService.deleteUser(id);
  }

  // Permissions
  @Get('settings/permissions')
  getPermissions() {
    return this.dataService.getPermissions();
  }

  @Post('settings/permissions')
  savePermissions(@Body() body: { permissions: Record<string, string[]> }) {
    return this.dataService.savePermissions(body.permissions);
  }

  // User Requests (ผู้ใช้ขอใช้อุปกรณ์/วัสดุ)
  @Get('user-requests')
  getUserRequests(@Query('status') status?: string, @Query('userId') userId?: string) {
    return this.dataService.getUserRequests({ status, userId });
  }

  @Post('user-requests')
  createUserRequest(@Body() data: any) {
    return this.dataService.createUserRequest(data);
  }

  @Post('user-requests/:id/approve')
  approveUserRequest(@Param('id') id: string, @Body() body: { approvedBy: string }) {
    return this.dataService.approveUserRequest(id, body.approvedBy);
  }

  @Post('user-requests/:id/reject')
  rejectUserRequest(@Param('id') id: string, @Body() body: { reason: string }) {
    return this.dataService.rejectUserRequest(id, body.reason);
  }

  @Post('user-requests/:id/fulfill')
  fulfillUserRequest(@Param('id') id: string, @Body() body: { fulfilledBy: string; fulfillments: any[] }) {
    return this.dataService.fulfillUserRequest(id, body.fulfilledBy, body.fulfillments);
  }

  @Post('user-requests/:id/receive')
  receiveUserRequest(@Param('id') id: string) {
    return this.dataService.receiveUserRequest(id);
  }
}
