import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Input } from '@/app/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Search, Eye, UserCheck, UserX, FileText, Mail, Phone } from 'lucide-react';
import { mockDrivers }  from "@/shared/lib/mock-data";
import { useState } from 'react';

export function DriversManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedDriver, setSelectedDriver] = useState<any>(null);

  const filteredDrivers = mockDrivers.filter(driver => {
    const matchesSearch = driver.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         driver.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         driver.vehiclePlate.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || driver.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Ativo</Badge>;
      case 'inactive':
        return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">Inativo</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Pendente</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Gestão de Motoristas</h2>
        <p className="text-muted-foreground">Gerencie todos os motoristas da plataforma</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, email ou placa..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Drivers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Motoristas ({filteredDrivers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Motorista</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Corridas</TableHead>
                <TableHead>Avaliação</TableHead>
                <TableHead>Ganhos Totais</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDrivers.map((driver) => (
                <TableRow key={driver.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{driver.name}</p>
                      <p className="text-sm text-muted-foreground">{driver.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p>{driver.vehicleType}</p>
                      <p className="text-sm text-muted-foreground">{driver.vehiclePlate}</p>
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(driver.status)}</TableCell>
                  <TableCell>{driver.ridesCompleted}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <span>{driver.rating > 0 ? driver.rating.toFixed(1) : 'N/A'}</span>
                      {driver.rating > 0 && <span className="text-yellow-500">★</span>}
                    </div>
                  </TableCell>
                  <TableCell>R$ {driver.totalEarnings.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedDriver(driver)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>Detalhes do Motorista</DialogTitle>
                          <DialogDescription>Informações completas e documentação</DialogDescription>
                        </DialogHeader>
                        {selectedDriver && (
                          <div className="space-y-6 mt-4">
                            {/* Personal Info */}
                            <div>
                              <h3 className="font-semibold mb-3">Informações Pessoais</h3>
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <p className="text-muted-foreground">Nome Completo</p>
                                  <p className="font-medium">{selectedDriver.name}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Status</p>
                                  <div className="mt-1">{getStatusBadge(selectedDriver.status)}</div>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Email</p>
                                  <p className="font-medium flex items-center gap-1">
                                    <Mail className="h-3 w-3" />
                                    {selectedDriver.email}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Telefone</p>
                                  <p className="font-medium flex items-center gap-1">
                                    <Phone className="h-3 w-3" />
                                    {selectedDriver.phone}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Data de Cadastro</p>
                                  <p className="font-medium">{new Date(selectedDriver.joinedDate).toLocaleDateString('pt-BR')}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Veículo</p>
                                  <p className="font-medium">{selectedDriver.vehicleType} - {selectedDriver.vehiclePlate}</p>
                                </div>
                              </div>
                            </div>

                            {/* Performance Stats */}
                            <div>
                              <h3 className="font-semibold mb-3">Desempenho</h3>
                              <div className="grid grid-cols-4 gap-4">
                                <div className="text-center p-3 bg-blue-50 rounded-lg">
                                  <p className="text-2xl font-bold text-blue-600">{selectedDriver.ridesCompleted}</p>
                                  <p className="text-xs text-muted-foreground">Corridas</p>
                                </div>
                                <div className="text-center p-3 bg-green-50 rounded-lg">
                                  <p className="text-2xl font-bold text-green-600">{selectedDriver.rating > 0 ? selectedDriver.rating.toFixed(1) : 'N/A'}</p>
                                  <p className="text-xs text-muted-foreground">Avaliação</p>
                                </div>
                                <div className="text-center p-3 bg-purple-50 rounded-lg">
                                  <p className="text-2xl font-bold text-purple-600">R$ {selectedDriver.totalEarnings.toFixed(0)}</p>
                                  <p className="text-xs text-muted-foreground">Ganhos Totais</p>
                                </div>
                                <div className="text-center p-3 bg-orange-50 rounded-lg">
                                  <p className="text-2xl font-bold text-orange-600">R$ {selectedDriver.availableBalance.toFixed(0)}</p>
                                  <p className="text-xs text-muted-foreground">Saldo</p>
                                </div>
                              </div>
                            </div>

                            {/* Documents */}
                            <div>
                              <h3 className="font-semibold mb-3">Documentos</h3>
                              <div className="space-y-2">
                                {selectedDriver.documents.map((doc: any) => (
                                  <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg">
                                    <div className="flex items-center gap-3">
                                      <FileText className="h-4 w-4 text-muted-foreground" />
                                      <div>
                                        <p className="font-medium text-sm">{doc.name}</p>
                                        <p className="text-xs text-muted-foreground">Enviado em {new Date(doc.uploadDate).toLocaleDateString('pt-BR')}</p>
                                      </div>
                                    </div>
                                    {doc.status === 'approved' && <Badge className="bg-green-100 text-green-800">Aprovado</Badge>}
                                    {doc.status === 'pending' && <Badge className="bg-yellow-100 text-yellow-800">Pendente</Badge>}
                                    {doc.status === 'rejected' && <Badge className="bg-red-100 text-red-800">Rejeitado</Badge>}
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                              {selectedDriver.status === 'pending' && (
                                <>
                                  <Button className="flex-1">
                                    <UserCheck className="h-4 w-4 mr-2" />
                                    Aprovar Motorista
                                  </Button>
                                  <Button variant="destructive" className="flex-1">
                                    <UserX className="h-4 w-4 mr-2" />
                                    Rejeitar
                                  </Button>
                                </>
                              )}
                              {selectedDriver.status === 'active' && (
                                <Button variant="outline" className="flex-1">
                                  <UserX className="h-4 w-4 mr-2" />
                                  Desativar Motorista
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
