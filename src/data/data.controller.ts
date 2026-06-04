import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards, BadRequestException, Req } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequiresPage } from '../auth/require-page.decorator';
import { DataService } from './data.service';
import { PermissionsService } from '../permissions/permissions.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class DataController {
  constructor(
    private readonly dataService: DataService,
    private readonly permissionsService: PermissionsService,
  ) {}

  // Stock Items
  @Get('stock-items')
  getStockItems(@Query('search') search?: string, @Query('category') category?: string) {
    return this.dataService.getStockItems({ search, category });
  }

  @Get('stock-items/next-code')
  getNextStockCode() {
    return this.dataService.getNextStockCode();
  }

  @Get('stock-items/:id/history')
  getStockHistory(@Param('id') id: string) {
    return this.dataService.getStockHistory(id);
  }

  @RequiresPage('/inventory/stock')
  @Post('stock-items/:id/add-quantity')
  addStockQuantity(
    @Param('id') id: string,
    @Body() body: { quantity: number; note?: string; addedBy?: string },
  ) {
    return this.dataService.addStockQuantity(id, body.quantity, body.note, body.addedBy);
  }

  @Get('stock-items/:id')
  getStockItemById(@Param('id') id: string) {
    return this.dataService.getStockItemById(id);
  }

  @RequiresPage('/inventory/stock')
  @Post('stock-items')
  createStockItem(@Body() data: any) {
    return this.dataService.createStockItem(data);
  }

  @RequiresPage('/inventory/stock')
  @Put('stock-items/:id')
  updateStockItem(@Param('id') id: string, @Body() data: any) {
    return this.dataService.updateStockItem(id, data);
  }

  @RequiresPage('/inventory/stock')
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

  @RequiresPage('/bookings/fulfill')
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

  @RequiresPage('/bookings/return-inspection')
  @Put('booking-returns/:id')
  inspectBookingReturn(@Param('id') id: string, @Body() data: any) {
    return this.dataService.inspectBookingReturn(id, data);
  }

  // Equipment Name Templates
  @Get('equipment-name-templates')
  getEquipmentNameTemplates() {
    return this.dataService.getEquipmentNameTemplates();
  }

  @Post('equipment-name-templates')
  createEquipmentNameTemplate(@Body() body: { name: string }) {
    return this.dataService.createEquipmentNameTemplate(body.name);
  }

  @Delete('equipment-name-templates/:id')
  deleteEquipmentNameTemplate(@Param('id') id: string) {
    return this.dataService.deleteEquipmentNameTemplate(id);
  }

  // Equipment Subcategories
  @Get('equipment-subcategories')
  getEquipmentSubcategories(@Query('category') category?: string) {
    return this.dataService.getEquipmentSubcategories(category);
  }

  @Post('equipment-subcategories')
  createEquipmentSubcategory(@Body() data: { category: string; name: string }) {
    return this.dataService.createEquipmentSubcategory(data);
  }

  @Put('equipment-subcategories/:id')
  updateEquipmentSubcategory(@Param('id') id: string, @Body() data: any) {
    return this.dataService.updateEquipmentSubcategory(id, data);
  }

  @Delete('equipment-subcategories/:id')
  deleteEquipmentSubcategory(@Param('id') id: string) {
    return this.dataService.deleteEquipmentSubcategory(id);
  }

  // Brands
  @Get('brands')
  getBrands() {
    return this.dataService.getBrands();
  }

  @RequiresPage('/inventory/stock')
  @Post('brands')
  createBrand(@Body() data: any) {
    return this.dataService.createBrand(data);
  }

  @RequiresPage('/inventory/stock')
  @Put('brands/:id')
  updateBrand(@Param('id') id: string, @Body() data: any) {
    return this.dataService.updateBrand(id, data);
  }

  @RequiresPage('/inventory/stock')
  @Delete('brands/:id')
  deleteBrand(@Param('id') id: string) {
    return this.dataService.deleteBrand(id);
  }

  // Projects
  @Get('projects')
  getProjects(@Query('status') status?: string) {
    return this.dataService.getProjects({ status });
  }

  @RequiresPage('/inventory/stock')
  @Post('projects')
  createProject(@Body() data: any) {
    return this.dataService.createProject(data);
  }

  @RequiresPage('/inventory/stock')
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
  @Get('equipment-units/history')
  getUnitHistory(@Query('unitCode') unitCode: string) {
    return this.dataService.getUnitHistory(unitCode);
  }

  @Get('equipment-units')
  getEquipmentUnits(@Query('equipmentId') equipmentId?: string) {
    return this.dataService.getEquipmentUnits({ equipmentId });
  }

  @RequiresPage('/inventory/stock')
  @Post('equipment-units')
  createEquipmentUnit(@Body() data: any) {
    return this.dataService.createEquipmentUnit(data);
  }

  @RequiresPage('/inventory/stock')
  @Put('equipment-units/:id')
  updateEquipmentUnit(@Param('id') id: string, @Body() data: any) {
    return this.dataService.updateEquipmentUnit(id, data);
  }

  @RequiresPage('/inventory/stock')
  @Delete('equipment-units/:id')
  deleteEquipmentUnit(@Param('id') id: string) {
    return this.dataService.deleteEquipmentUnit(id);
  }

  // Users
  @RequiresPage('/users/manage')
  @Get('users')
  getUsers() {
    return this.dataService.getUsers();
  }

  @RequiresPage('/users/manage')
  @Post('users')
  async createUser(@Body() body: { name: string; email: string; role: string; department?: string; password: string }) {
    if (!body.name || !body.email || !body.password) throw new BadRequestException('name, email and password are required');
    const password_hash = await bcrypt.hash(body.password, 10);
    return this.dataService.createUserAccount({ name: body.name, email: body.email, role: body.role ?? 'user', department: body.department, password_hash });
  }

  @RequiresPage('/users/manage')
  @Put('users/:id')
  updateUser(@Param('id') id: string, @Body() data: { name?: string; role?: string; department?: string; is_active?: boolean }) {
    return this.dataService.updateUserAccount(id, data);
  }

  @RequiresPage('/users/manage')
  @Delete('users/:id')
  deleteUser(@Param('id') id: string) {
    return this.dataService.deleteUser(id);
  }

  // Permissions — GET is open to all authenticated users (sidebar uses it to build nav)
  @Get('settings/permissions')
  getPermissions() {
    return this.dataService.getPermissions();
  }

  @RequiresPage('/settings/permissions')
  @Post('settings/permissions')
  async savePermissions(@Body() body: { permissions: Record<string, string[]> }) {
    const result = await this.dataService.savePermissions(body.permissions);
    this.permissionsService.invalidate();
    return result;
  }

  // User Requests (ผู้ใช้ขอใช้อุปกรณ์/วัสดุ)
  @Get('user-requests')
  getUserRequests(
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('type') type?: string,
    @Req() req?: any,
  ) {
    const me = req?.user;
    const isManager = ['admin', 'executive', 'dept_head'].includes(me?.role);
    const effectiveUserId = isManager ? userId : me?.id;
    return this.dataService.getUserRequests({ status, userId: effectiveUserId, type });
  }

  @Get('user-requests/stats')
  getUserRequestStats() {
    return this.dataService.getUserRequestStats();
  }

  @Get('user-requests/monthly-stats')
  getMonthlyBookingStats() {
    return this.dataService.getMonthlyBookingStats();
  }

  @Get('user-requests/calendar')
  getBookingsCalendar() {
    return this.dataService.getBookingsCalendar();
  }

  @Get('user-requests/next-doc-no')
  getNextManifestDocNo() {
    return this.dataService.getNextManifestDocNo();
  }

  @Get('user-requests/next-backload-doc-no')
  getNextBackloadDocNo() {
    return this.dataService.getNextBackloadDocNo();
  }

  @Post('user-requests/:id/assign-backload-no')
  assignBackloadDocNo(@Param('id') id: string) {
    return this.dataService.assignBackloadDocNo(id);
  }

  @Get('user-requests/:id')
  getUserRequestById(@Param('id') id: string) {
    return this.dataService.getUserRequests({ id } as any).then((rows: any[]) => rows[0] ?? null);
  }

  @Post('user-requests/direct-manifest')
  createDirectManifest(@Body() data: any) {
    return this.dataService.createDirectManifest(data);
  }

  @Post('user-requests')
  createUserRequest(@Body() data: any) {
    return this.dataService.createUserRequest(data);
  }

  @RequiresPage('/bookings/approve-requests')
  @Post('user-requests/:id/approve')
  approveUserRequest(@Param('id') id: string, @Body() body: { approvedBy: string }) {
    return this.dataService.approveUserRequest(id, body.approvedBy);
  }

  @RequiresPage('/bookings/approve-requests')
  @Post('user-requests/:id/reject')
  rejectUserRequest(@Param('id') id: string, @Body() body: { reason: string }) {
    return this.dataService.rejectUserRequest(id, body.reason);
  }

  @RequiresPage('/bookings/fulfill')
  @Post('user-requests/:id/fulfill')
  fulfillUserRequest(@Param('id') id: string, @Body() body: { fulfilledBy: string; fulfillments: any[]; manifest?: any }) {
    return this.dataService.fulfillUserRequest(id, body.fulfilledBy, body.fulfillments, body.manifest);
  }

  @RequiresPage('/bookings/fulfill')
  @Patch('user-requests/:id/manifest')
  updateManifest(@Param('id') id: string, @Body() body: any) {
    return this.dataService.updateManifest(id, body);
  }

  @Post('user-requests/:id/receive')
  receiveUserRequest(@Param('id') id: string) {
    return this.dataService.receiveUserRequest(id);
  }

  @Post('user-requests/:id/start-return')
  startReturnUserRequest(@Param('id') id: string, @Body() body: { returnItems?: any[] }) {
    return this.dataService.startReturnUserRequest(id, body.returnItems);
  }

  @Post('user-requests/:id/return')
  returnUserRequest(@Param('id') id: string) {
    return this.dataService.returnUserRequest(id);
  }

  @RequiresPage('/bookings/return-inspection')
  @Post('user-requests/:id/complete')
  completeUserRequest(@Param('id') id: string, @Body() body: { inspectionResults?: any[] }) {
    return this.dataService.completeUserRequest(id, body.inspectionResults);
  }

  // Inspection Images
  @Post('user-requests/:id/inspection-images')
  saveInspectionImage(
    @Param('id') id: string,
    @Body() body: { filename: string; mimetype: string; data: string },
  ) {
    return this.dataService.saveInspectionImage(id, body.filename, body.mimetype, body.data);
  }

  @Get('user-requests/:id/inspection-images')
  getInspectionImages(@Param('id') id: string) {
    return this.dataService.getInspectionImages(id);
  }

  @RequiresPage('/bookings/return-inspection')
  @Delete('inspection-images/:id')
  deleteInspectionImage(@Param('id') id: string) {
    return this.dataService.deleteInspectionImage(id);
  }

  // Inventory / Equipment Status
  @Get('inventory/equipment-status')
  getEquipmentInventory(@Query('equipmentId') equipmentId?: string) {
    return this.dataService.getEquipmentInventory(equipmentId || undefined);
  }
}
