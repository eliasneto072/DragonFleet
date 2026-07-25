import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

// As variantes usavam hexadecimais cravados: bg-[#1D1D1D], text-[#1D1D1D],
// border-[#1D1D1D], hover:bg-[#108865]. No tema escuro o cartão é #181b19,
// praticamente a mesma cor de #1D1D1D, então todo botão outline ficava com
// borda e texto pretos sobre fundo preto — invisível até passar o rato, que
// preenchia de verde.
//
// Os tokens do theme.css já invertem sozinhos (--primary é #1D1D1D no claro e
// #ffffff no escuro), portanto basta consumi-los.
//
// O hover usa --brand-600 e não --brand-500: com branco por cima, brand-500
// dá 4.1:1 no claro e 2.9:1 no escuro, abaixo do mínimo legível. brand-600
// passa nos dois (6.4:1 e 5.3:1).
//
// A opacidade em border-foreground/30 é o único ajuste de gosto aqui: a borda
// anterior era preto sólido, mais pesada que a hairline dos cartões. Subir
// para /60 ou /90 devolve o peso original, se preferires.

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border border-primary hover:bg-brand-600 hover:border-brand-600 hover:text-white",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border border-foreground/30 bg-transparent text-foreground hover:bg-brand-600 hover:text-white hover:border-brand-600",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        // Antes preenchia de verde sólido no hover. Num botão de ícone isso é
        // pesado, e --accent com texto branco fica em 2.9:1 no tema escuro.
        ghost:
          "hover:bg-muted hover:text-foreground",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-6 py-2.5 has-[>svg]:px-4",
        sm: "h-8 rounded-full gap-1.5 px-4 has-[>svg]:px-3",
        lg: "h-12 rounded-full px-8 has-[>svg]:px-6 text-base",
        icon: "size-10 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean;
    }
>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  );
});

Button.displayName = "Button";

export { Button, buttonVariants };
