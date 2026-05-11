export type UserRole = 'driver' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  avatar?: string;
  createdAt: string;
}

export type DriverStatus = 'active' | 'inactive' | 'pending' | 'suspended';

export interface Driver extends User {
  role: 'driver';
  license: string;
  vehicleType: string;
  vehiclePlate: string;
  rating: number;
  totalTrips: number;
  totalEarnings: number;
  availableBalance: number;
  status: DriverStatus;
  vehicleId?: string;
  documents: DriverDocument[];
  joinedDate: string;
}

export type DocumentType =
  | 'license'
  | 'tvde_certificate'
  | 'insurance'
  | 'criminal_record'
  | 'id_card'
  | 'vehicle_registration';

export type DocumentStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'expiring_soon';

export interface DriverDocument {
  id: string;
  type: DocumentType;
  name: string;
  fileUrl?: string;
  uploadDate: string;
  expiryDate?: string;
  status: DocumentStatus;
  notes?: string;
}

export type VehicleType = 'sedan' | 'hatch' | 'suv' | 'van' | 'electric' | 'hybrid';
export type VehicleStatus = 'available' | 'in_use' | 'maintenance';

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string;
  color: string;
  type: VehicleType;
  status: VehicleStatus;
  driverId?: string;
  driverName?: string;
}

export type Platform = 'uber' | 'bolt' | 'other';

export interface Earning {
  id: string;
  driverId: string;
  date: string;
  amount: number;
  type: 'ride' | 'bonus' | 'tip';
  description: string;
  status: 'completed' | 'pending';
  platform?: Platform;
}

export type WithdrawalStatus = 'pending' | 'approved' | 'rejected' | 'paid' | 'completed';
export type WithdrawalMethod = 'pix' | 'bank_transfer' | 'paypal';

export interface Withdrawal {
  id: string;
  driverId: string;
  amount: number;
  requestDate: string;
  approvalDate?: string;
  paymentDate?: string;
  status: WithdrawalStatus;
  method: WithdrawalMethod;
  accountInfo: string;
  notes?: string;
  approvedBy?: string;
}

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  createdAt: string;
  actionUrl?: string;
}

export type TicketCategory = 'technical' | 'financial' | 'documents' | 'account' | 'other';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface SupportTicket {
  id: string;
  userId: string;
  subject: string;
  message: string;
  category: TicketCategory;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
  responses: SupportResponse[];
}

export interface SupportResponse {
  id: string;
  ticketId: string;
  userId: string;
  message: string;
  isAdmin: boolean;
  createdAt: string;
  attachments?: string[];
}

export interface AdminStats {
  totalDrivers: number;
  activeDrivers: number;
  totalRevenue: number;
  monthlyRevenue: number;
  totalRides: number;
  monthlyRides: number;
  averageRating: number;
  pendingWithdrawals: number;
  pendingDocuments: number;
}

export interface SystemConfig {
  companyCommission: number;
  minWithdrawalAmount: number;
  maxWithdrawalAmount: number;
  withdrawalProcessingDays: number;
  documentExpiryWarningDays: number;
  platformIntegrations: { uber: boolean; bolt: boolean };
  emailNotifications: boolean;
  smsNotifications: boolean;
}