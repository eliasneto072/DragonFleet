import { cn } from "./utils";

// O placeholder usa bg-muted, não bg-accent.
// Neste projeto --accent é o verde da marca (#108865), então bg-accent
// renderizava cada skeleton como um bloco verde sólido — lê como tela
// quebrada, não como carregamento. --muted é o cinza neutro correto e já
// tem contrapartida no modo escuro.
//
// motion-reduce:animate-none respeita prefers-reduced-motion: o placeholder
// continua visível, apenas para de pulsar.

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "bg-muted animate-pulse rounded-md motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
