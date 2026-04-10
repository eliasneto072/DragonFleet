import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { User, Mail, Phone, MapPin, Car } from 'lucide-react';
import { useState } from 'react';

interface ProfileData {
  name: string;
  email: string;
  phone: string;
  address: string;
  license: string;
  vehiclePlate: string;
}

export function DriverProfile() {
  const [isEditing, setIsEditing] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData>({
    name: 'João Silva',
    email: 'joao.silva@email.com',
    phone: '+351 912 345 678',
    address: 'Lisboa, Portugal',
    license: 'PT123456789',
    vehiclePlate: 'AB-12-CD',
  });

  const handleSave = () => {
    setIsEditing(false);
    // Mock save - aqui conectaria com a API
  };

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <Card className="bg-gradient-to-br from-[#1D1D1D] to-[#108865]">
        <CardContent className="pt-6">
          <div className="flex items-center gap-6">
            <div className="h-24 w-24 rounded-full bg-white flex items-center justify-center">
              <User className="h-12 w-12 text-[#1D1D1D]" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white">{profileData.name}</h2>
              <p className="text-gray-200">{profileData.email}</p>
              <div className="flex gap-4 mt-2">
                <span className="px-3 py-1 bg-white/20 text-white rounded-full text-sm">
                  ⭐ 4.8 Rating
                </span>
                <span className="px-3 py-1 bg-white/20 text-white rounded-full text-sm">
                  147 Viagens
                </span>
              </div>
            </div>
            <Button
              variant="outline"
              className="bg-white text-[#1D1D1D] hover:bg-gray-100"
              onClick={() => setIsEditing(!isEditing)}
            >
              {isEditing ? 'Cancelar' : 'Editar Perfil'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Personal Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Informações Pessoais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Nome Completo</Label>
              <Input
                id="name"
                value={profileData.name}
                disabled={!isEditing}
                onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={profileData.email}
                  disabled={!isEditing}
                  onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="phone">Telefone</Label>
              <div className="relative mt-1">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  value={profileData.phone}
                  disabled={!isEditing}
                  onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="address">Morada</Label>
              <div className="relative mt-1">
                <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="address"
                  value={profileData.address}
                  disabled={!isEditing}
                  onChange={(e) => setProfileData({ ...profileData, address: e.target.value })}
                  className="pl-10"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Professional Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            Informações Profissionais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="license">Número da Carta</Label>
              <Input
                id="license"
                value={profileData.license}
                disabled={!isEditing}
                onChange={(e) => setProfileData({ ...profileData, license: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="vehicle">Matrícula do Veículo</Label>
              <Input
                id="vehicle"
                value={profileData.vehiclePlate}
                disabled={!isEditing}
                onChange={(e) => setProfileData({ ...profileData, vehiclePlate: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          {isEditing && (
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave}>
                Guardar Alterações
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Segurança</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" className="w-full md:w-auto">
            Alterar Password
          </Button>
          <p className="text-sm text-muted-foreground">
            Última alteração: 15 de dezembro de 2025
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
