import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Badge } from '@/app/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/app/components/ui/dialog';
import { Car, Plus, Settings, AlertCircle, CheckCircle } from 'lucide-react';
import { useState } from 'react';

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string;
  color: string;
  type: string;
  status: 'available' | 'in_use' | 'maintenance';
  driverName?: string;
  driverId?: string;
}

const mockVehicles: Vehicle[] = [
  {
    id: '1',
    make: 'Tesla',
    model: 'Model 3',
    year: 2023,
    licensePlate: 'AB-12-CD',
    color: 'Branco',
    type: 'Elétrico',
    status: 'in_use',
    driverName: 'João Silva',
    driverId: '101',
  },
  {
    id: '2',
    make: 'Nissan',
    model: 'Leaf',
    year: 2022,
    licensePlate: 'EF-34-GH',
    color: 'Azul',
    type: 'Elétrico',
    status: 'in_use',
    driverName: 'Maria Santos',
    driverId: '102',
  },
  {
    id: '3',
    make: 'Toyota',
    model: 'Prius',
    year: 2021,
    licensePlate: 'IJ-56-KL',
    color: 'Preto',
    type: 'Híbrido',
    status: 'available',
  },
  {
    id: '4',
    make: 'Volkswagen',
    model: 'ID.3',
    year: 2023,
    licensePlate: 'MN-78-OP',
    color: 'Cinza',
    type: 'Elétrico',
    status: 'maintenance',
  },
];

const mockDrivers = [
  { id: '101', name: 'João Silva' },
  { id: '102', name: 'Maria Santos' },
  { id: '103', name: 'Pedro Costa' },
  { id: '104', name: 'Ana Ferreira' },
];

export function FleetManagement() {
  const [vehicles] = useState<Vehicle[]>(mockVehicles);
  const [selectedDriver, setSelectedDriver] = useState('');
  const [newVehicle, setNewVehicle] = useState({
    make: '',
    model: '',
    year: new Date().getFullYear(),
    licensePlate: '',
    color: '',
    type: 'sedan',
  });

  const getStatusBadge = (status: Vehicle['status']) => {
    const config = {
      available: { label: 'Disponível', variant: 'default' as const, icon: CheckCircle },
      in_use: { label: 'Em Uso', variant: 'secondary' as const, icon: Car },
      maintenance: { label: 'Manutenção', variant: 'outline' as const, icon: AlertCircle },
    };

    const { label, variant, icon: Icon } = config[status];
    return (
      <Badge variant={variant} className="flex items-center gap-1 w-fit">
        <Icon className="h-3 w-3" />
        {label}
      </Badge>
    );
  };

  const handleAddVehicle = () => {
    alert('Veículo adicionado com sucesso!');
    setNewVehicle({
      make: '',
      model: '',
      year: new Date().getFullYear(),
      licensePlate: '',
      color: '',
      type: 'sedan',
    });
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total de Veículos</p>
                <h3 className="text-2xl font-bold mt-1">{vehicles.length}</h3>
              </div>
              <div className="h-12 w-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                <Car className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Disponíveis</p>
                <h3 className="text-2xl font-bold mt-1 text-green-600">
                  {vehicles.filter(v => v.status === 'available').length}
                </h3>
              </div>
              <div className="h-12 w-12 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Em Uso</p>
                <h3 className="text-2xl font-bold mt-1">
                  {vehicles.filter(v => v.status === 'in_use').length}
                </h3>
              </div>
              <div className="h-12 w-12 bg-gradient-to-br from-[#108865] to-[#0d6b4f] rounded-lg flex items-center justify-center">
                <Car className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Manutenção</p>
                <h3 className="text-2xl font-bold mt-1 text-orange-600">
                  {vehicles.filter(v => v.status === 'maintenance').length}
                </h3>
              </div>
              <div className="h-12 w-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center">
                <Settings className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Gestão de Frotas</h2>
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Veículo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Novo Veículo</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="make">Marca</Label>
                  <Input
                    id="make"
                    placeholder="Tesla"
                    value={newVehicle.make}
                    onChange={(e) => setNewVehicle({ ...newVehicle, make: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="model">Modelo</Label>
                  <Input
                    id="model"
                    placeholder="Model 3"
                    value={newVehicle.model}
                    onChange={(e) => setNewVehicle({ ...newVehicle, model: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="year">Ano</Label>
                  <Input
                    id="year"
                    type="number"
                    value={newVehicle.year}
                    onChange={(e) => setNewVehicle({ ...newVehicle, year: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="plate">Matrícula</Label>
                  <Input
                    id="plate"
                    placeholder="AB-12-CD"
                    value={newVehicle.licensePlate}
                    onChange={(e) => setNewVehicle({ ...newVehicle, licensePlate: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="color">Cor</Label>
                  <Input
                    id="color"
                    placeholder="Branco"
                    value={newVehicle.color}
                    onChange={(e) => setNewVehicle({ ...newVehicle, color: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="type">Tipo</Label>
                  <Select
                    value={newVehicle.type}
                    onValueChange={(value) => setNewVehicle({ ...newVehicle, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sedan">Sedan</SelectItem>
                      <SelectItem value="suv">SUV</SelectItem>
                      <SelectItem value="electric">Elétrico</SelectItem>
                      <SelectItem value="hybrid">Híbrido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={handleAddVehicle} className="w-full">
                Adicionar Veículo
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Vehicles Table */}
      <Card>
        <CardHeader>
          <CardTitle>Veículos da Frota</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b">
                <tr className="text-left">
                  <th className="pb-3 font-semibold">Veículo</th>
                  <th className="pb-3 font-semibold">Matrícula</th>
                  <th className="pb-3 font-semibold">Tipo</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Motorista</th>
                  <th className="pb-3 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((vehicle) => (
                  <tr key={vehicle.id} className="border-b last:border-0">
                    <td className="py-4">
                      <div>
                        <p className="font-semibold">
                          {vehicle.make} {vehicle.model}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {vehicle.year} • {vehicle.color}
                        </p>
                      </div>
                    </td>
                    <td className="py-4">
                      <span className="font-mono font-semibold">{vehicle.licensePlate}</span>
                    </td>
                    <td className="py-4">
                      <Badge variant="outline">{vehicle.type}</Badge>
                    </td>
                    <td className="py-4">{getStatusBadge(vehicle.status)}</td>
                    <td className="py-4">
                      {vehicle.status === 'in_use' && vehicle.driverName ? (
                        <span>{vehicle.driverName}</span>
                      ) : vehicle.status === 'available' ? (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              Associar Motorista
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Associar Motorista</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 mt-4">
                              <Label>Selecionar Motorista</Label>
                              <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Escolha um motorista" />
                                </SelectTrigger>
                                <SelectContent>
                                  {mockDrivers.map((driver) => (
                                    <SelectItem key={driver.id} value={driver.id}>
                                      {driver.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                onClick={() => alert('Motorista associado com sucesso!')}
                                className="w-full"
                              >
                                Confirmar Associação
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="py-4">
                      <Button variant="ghost" size="sm">
                        Ver Detalhes
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
