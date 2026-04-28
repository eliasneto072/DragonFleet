// src/app/components/driver/profile.tsx

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { User, Mail, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/context/AuthContext';
import { usersService } from '@/features/admin/services/users.service';
import { queryKeys } from '@/shared/lib/query-keys';

export function DriverProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  // 🔹 Query
  const {
    data: profileData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: queryKeys.users.detail(user?.id),
    queryFn: async () => {
      const res = await usersService.getById(user!.id);
      return res.user ?? res;
    },
    enabled: !!user?.id, // evita erro quando user ainda não carregou
  });

  // 🔹 Preenche os inputs quando chegar dado
  useEffect(() => {
    if (profileData) {
      setName(profileData.name);
      setEmail(profileData.email);
    }
  }, [profileData]);

  // 🔹 Mutation
  const { mutate: updateUser, isPending } = useMutation({
    mutationFn: () => usersService.update(user!.id, { name, email }),
    onSuccess: ({ user: updated }) => {
      queryClient.setQueryData(queryKeys.users.detail(user!.id), updated);
      toast.success('Perfil atualizado com sucesso!');
      setIsEditing(false);
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao atualizar perfil.');
    },
  });

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateUser();
  }

  // 🔹 Loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Carregando perfil…</span>
      </div>
    );
  }

  // 🔹 Error
  if (isError || !profileData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-muted-foreground">Erro ao carregar perfil.</p>
        <Button
          variant="outline"
          onClick={() =>
            queryClient.invalidateQueries({
              queryKey: queryKeys.users.detail(user?.id),
            })
          }
        >
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-gradient-to-br from-[#1D1D1D] to-[#108865]">
        <CardContent className="pt-6">
          <div className="flex items-center gap-6">
            <div className="h-24 w-24 rounded-full bg-white flex items-center justify-center">
              <User className="h-12 w-12 text-[#1D1D1D]" />
            </div>

            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white">
                {profileData.name}
              </h2>
              <p className="text-gray-200">{profileData.email}</p>

              <div className="flex gap-3 mt-2">
                <span className="px-3 py-1 bg-white/20 text-white rounded-full text-sm capitalize">
                  {profileData.role === 'DRIVER'
                    ? 'Motorista'
                    : profileData.role === 'ADMIN'
                    ? 'Admin'
                    : 'Manager'}
                </span>

                <span
                  className={`px-3 py-1 rounded-full text-sm ${
                    profileData.status === 'ACTIVE'
                      ? 'bg-green-400/30 text-green-100'
                      : 'bg-red-400/30 text-red-100'
                  }`}
                >
                  {profileData.status === 'ACTIVE'
                    ? 'Ativo'
                    : profileData.status === 'INACTIVE'
                    ? 'Inativo'
                    : 'Bloqueado'}
                </span>
              </div>
            </div>

            <Button
              variant="outline"
              className="bg-white text-[#1D1D1D]"
              onClick={() => setIsEditing(!isEditing)}
            >
              {isEditing ? 'Cancelar' : 'Editar Perfil'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>Informações Pessoais</CardTitle>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>Nome</Label>
                <Input
                  value={name}
                  disabled={!isEditing}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <Label>Email</Label>
                <Input
                  value={email}
                  disabled={!isEditing}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>Membro desde</Label>
                <Input
                  value={new Date(profileData.createdAt).toLocaleDateString(
                    'pt-BR'
                  )}
                  disabled
                />
              </div>

              <div>
                <Label>Última atualização</Label>
                <Input
                  value={new Date(profileData.updatedAt).toLocaleDateString(
                    'pt-BR'
                  )}
                  disabled
                />
              </div>
            </div>

            {isEditing && (
              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsEditing(false);
                    setName(profileData.name);
                    setEmail(profileData.email);
                  }}
                >
                  Cancelar
                </Button>

                <Button type="submit" disabled={isPending}>
                  {isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Salvar
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}