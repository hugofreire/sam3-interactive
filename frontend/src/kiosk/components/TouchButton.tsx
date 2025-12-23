/**
 * TouchButton - Large touch-friendly button (min 48px, recommended 64px)
 * Supports rendering as different elements via `as` prop (useful for file inputs)
 */

import { ReactNode, ButtonHTMLAttributes, ElementType, ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

type TouchButtonBaseProps = {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'default' | 'lg' | 'xl';
  fullWidth?: boolean;
  icon?: ReactNode;
  as?: ElementType;
};

type TouchButtonProps<T extends ElementType = 'button'> = TouchButtonBaseProps &
  Omit<ComponentPropsWithoutRef<T>, keyof TouchButtonBaseProps>;

export default function TouchButton<T extends ElementType = 'button'>({
  children,
  variant = 'primary',
  size = 'default',
  fullWidth = false,
  icon,
  className,
  disabled,
  as,
  ...props
}: TouchButtonProps<T>) {
  const Component = as || 'button';

  const baseStyles = 'inline-flex items-center justify-center gap-3 rounded-xl font-semibold transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer';

  const variantStyles = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70',
    outline: 'border-2 border-primary text-primary hover:bg-primary/10 active:bg-primary/20',
    ghost: 'text-foreground hover:bg-muted active:bg-muted/80',
    danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80',
  };

  const sizeStyles = {
    default: 'h-14 px-6 text-lg min-w-[120px]',
    lg: 'h-16 px-8 text-xl min-w-[160px]',
    xl: 'h-20 px-10 text-2xl min-w-[200px]',
  };

  return (
    <Component
      className={cn(
        baseStyles,
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && 'w-full',
        className
      )}
      disabled={Component === 'button' ? disabled : undefined}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </Component>
  );
}
