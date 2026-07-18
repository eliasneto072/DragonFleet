// Mock data for DragonFleet platform

export interface Driver {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: 'active' | 'inactive' | 'pending';
  vehicleType: string;
  vehiclePlate: string;
  totalEarnings: number;
  availableBalance: number;
  ridesCompleted: number;
  rating: number;
  joinedDate: string;
  documents: Document[];
}

export interface Document {
  id: string;
  type: string;
  name: string;
  status: 'approved' | 'pending' | 'rejected';
  uploadDate: string;
  expiryDate?: string;
}

export interface Earning {
  id: string;
  driverId: string;
  date: string;
  amount: number;
  type: 'ride' | 'bonus' | 'tip';
  description: string;
  status: 'completed' | 'pending';
}

export interface Withdrawal {
  id: string;
  driverId: string;
  date: string;
  amount: number;
  status: 'completed' | 'pending' | 'rejected';
  method: string;
  accountInfo: string;
}

export const mockDrivers: Driver[] = [
  {
    id: '1',
    name: 'João Silva',
    email: 'joao.silva@email.com',
    phone: '(11) 98765-4321',
    status: 'active',
    vehicleType: 'Sedan',
    vehiclePlate: 'ABC-1234',
    totalEarnings: 15420.50,
    availableBalance: 3240.75,
    ridesCompleted: 847,
    rating: 4.8,
    joinedDate: '2023-06-15',
    documents: [
      { id: 'd1', type: 'CNH', name: 'Carteira Nacional de Habilitação', status: 'approved', uploadDate: '2023-06-15', expiryDate: '2028-06-15' },
      { id: 'd2', type: 'CRLV', name: 'Certificado de Registro do Veículo', status: 'approved', uploadDate: '2023-06-15', expiryDate: '2026-12-31' },
    ]
  },
  {
    id: '2',
    name: 'Maria Santos',
    email: 'maria.santos@email.com',
    phone: '(11) 97654-3210',
    status: 'active',
    vehicleType: 'Hatch',
    vehiclePlate: 'DEF-5678',
    totalEarnings: 22150.80,
    availableBalance: 1890.30,
    ridesCompleted: 1203,
    rating: 4.9,
    joinedDate: '2023-03-10',
    documents: [
      { id: 'd3', type: 'CNH', name: 'Carteira Nacional de Habilitação', status: 'approved', uploadDate: '2023-03-10', expiryDate: '2027-03-10' },
      { id: 'd4', type: 'CRLV', name: 'Certificado de Registro do Veículo', status: 'approved', uploadDate: '2023-03-10', expiryDate: '2026-12-31' },
    ]
  },
  {
    id: '3',
    name: 'Pedro Oliveira',
    email: 'pedro.oliveira@email.com',
    phone: '(11) 96543-2109',
    status: 'pending',
    vehicleType: 'SUV',
    vehiclePlate: 'GHI-9012',
    totalEarnings: 0,
    availableBalance: 0,
    ridesCompleted: 0,
    rating: 0,
    joinedDate: '2026-01-25',
    documents: [
      { id: 'd5', type: 'CNH', name: 'Carteira Nacional de Habilitação', status: 'pending', uploadDate: '2026-01-25', expiryDate: '2029-01-25' },
      { id: 'd6', type: 'CRLV', name: 'Certificado de Registro do Veículo', status: 'pending', uploadDate: '2026-01-25', expiryDate: '2026-12-31' },
    ]
  },
  {
    id: '4',
    name: 'Ana Costa',
    email: 'ana.costa@email.com',
    phone: '(11) 95432-1098',
    status: 'active',
    vehicleType: 'Sedan',
    vehiclePlate: 'JKL-3456',
    totalEarnings: 18670.20,
    availableBalance: 2450.90,
    ridesCompleted: 965,
    rating: 4.7,
    joinedDate: '2023-08-20',
    documents: [
      { id: 'd7', type: 'CNH', name: 'Carteira Nacional de Habilitação', status: 'approved', uploadDate: '2023-08-20', expiryDate: '2028-08-20' },
      { id: 'd8', type: 'CRLV', name: 'Certificado de Registro do Veículo', status: 'approved', uploadDate: '2023-08-20', expiryDate: '2026-12-31' },
    ]
  },
];

export const mockEarnings: Earning[] = [
  { id: 'e1', driverId: '1', date: '2026-01-28', amount: 245.50, type: 'ride', description: 'Corrida #8471 - Centro para Jardins', status: 'completed' },
  { id: 'e2', driverId: '1', date: '2026-01-28', amount: 15.00, type: 'tip', description: 'Gorjeta - Corrida #8471', status: 'completed' },
  { id: 'e3', driverId: '1', date: '2026-01-27', amount: 180.30, type: 'ride', description: 'Corrida #8465 - Morumbi para Brooklin', status: 'completed' },
  { id: 'e4', driverId: '1', date: '2026-01-27', amount: 50.00, type: 'bonus', description: 'Bônus por meta semanal atingida', status: 'completed' },
  { id: 'e5', driverId: '1', date: '2026-01-26', amount: 320.75, type: 'ride', description: 'Corrida #8450 - Aeroporto GRU', status: 'completed' },
  { id: 'e6', driverId: '1', date: '2026-01-26', amount: 195.20, type: 'ride', description: 'Corrida #8445 - Vila Madalena', status: 'completed' },
  { id: 'e7', driverId: '1', date: '2026-01-25', amount: 210.40, type: 'ride', description: 'Corrida #8432 - Paulista para Pinheiros', status: 'completed' },
];

export const mockWithdrawals: Withdrawal[] = [
  { id: 'w1', driverId: '1', date: '2026-01-20', amount: 2000.00, status: 'completed', method: 'Pix', accountInfo: 'joao.silva@email.com' },
  { id: 'w2', driverId: '1', date: '2026-01-10', amount: 1500.00, status: 'completed', method: 'Transferência Bancária', accountInfo: 'Banco 001 - Ag: 1234 - CC: 56789-0' },
  { id: 'w3', driverId: '1', date: '2025-12-28', amount: 2500.00, status: 'completed', method: 'Pix', accountInfo: 'joao.silva@email.com' },
  { id: 'w4', driverId: '1', date: '2025-12-15', amount: 1800.00, status: 'completed', method: 'Pix', accountInfo: 'joao.silva@email.com' },
];

export const monthlyEarningsData = [
  { month: 'Jul', earnings: 12500 },
  { month: 'Ago', earnings: 15200 },
  { month: 'Set', earnings: 13800 },
  { month: 'Out', earnings: 16400 },
  { month: 'Nov', earnings: 14900 },
  { month: 'Dez', earnings: 18200 },
  { month: 'Jan', earnings: 19500 },
];

export const weeklyRidesData = [
  { day: 'Seg', rides: 15 },
  { day: 'Ter', rides: 18 },
  { day: 'Qua', rides: 22 },
  { day: 'Qui', rides: 20 },
  { day: 'Sex', rides: 25 },
  { day: 'Sáb', rides: 30 },
  { day: 'Dom', rides: 28 },
];

export const adminStatsData = {
  totalDrivers: 156,
  activeDrivers: 142,
  totalRevenue: 2847650.50,
  monthlyRevenue: 487320.75,
  totalRides: 45289,
  monthlyRides: 8547,
  averageRating: 4.7,
  pendingWithdrawals: 12,
};

export const revenueByMonthData = [
  { month: 'Jul', revenue: 385000 },
  { month: 'Ago', revenue: 420000 },
  { month: 'Set', revenue: 398000 },
  { month: 'Out', revenue: 445000 },
  { month: 'Nov', revenue: 412000 },
  { month: 'Dez', revenue: 478000 },
  { month: 'Jan', revenue: 487320 },
];

export const ridesByVehicleType = [
  { type: 'Sedan', rides: 18500, percentage: 41 },
  { type: 'Hatch', rides: 15200, percentage: 34 },
  { type: 'SUV', rides: 8300, percentage: 18 },
  { type: 'Van', rides: 3289, percentage: 7 },
];
