// Shorthand ambient modules: every import from these becomes `any`.
// Lets tsc run with no node_modules so the project's OWN types still get checked.

declare module "react";
declare module "react/jsx-runtime";
declare module "react-dom/client";
declare module "react-dom";
declare module "lucide-react";
declare module "recharts";
declare module "@tanstack/react-query";
declare module "react-router-dom";
declare module "sonner";
declare module "next-themes";
declare module "vitest";
declare module "clsx";
declare module "tailwind-merge";
declare module "class-variance-authority";
declare module "date-fns";
declare module "zod";
declare module "cmdk";
declare module "vaul";
declare module "embla-carousel-react";
declare module "input-otp";
declare module "react-day-picker";
declare module "react-hook-form";
declare module "react-resizable-panels";
declare module "@hookform/resolvers/zod";
declare module "tailwindcss-animate";
declare module "@tailwindcss/typography";
declare module "@radix-ui/react-accordion";
declare module "@radix-ui/react-alert-dialog";
declare module "@radix-ui/react-aspect-ratio";
declare module "@radix-ui/react-avatar";
declare module "@radix-ui/react-checkbox";
declare module "@radix-ui/react-collapsible";
declare module "@radix-ui/react-context-menu";
declare module "@radix-ui/react-dialog";
declare module "@radix-ui/react-dropdown-menu";
declare module "@radix-ui/react-hover-card";
declare module "@radix-ui/react-label";
declare module "@radix-ui/react-menubar";
declare module "@radix-ui/react-navigation-menu";
declare module "@radix-ui/react-popover";
declare module "@radix-ui/react-progress";
declare module "@radix-ui/react-radio-group";
declare module "@radix-ui/react-scroll-area";
declare module "@radix-ui/react-select";
declare module "@radix-ui/react-separator";
declare module "@radix-ui/react-slider";
declare module "@radix-ui/react-slot";
declare module "@radix-ui/react-switch";
declare module "@radix-ui/react-tabs";
declare module "@radix-ui/react-toggle";
declare module "@radix-ui/react-toggle-group";
declare module "@radix-ui/react-tooltip";

declare namespace React { type ReactNode = any; type FC<P=any> = any; type CSSProperties = any;
  type ComponentProps<T=any> = any; type ReactElement = any; type Ref<T=any> = any;
  type MouseEvent<T=any> = any; type ChangeEvent<T=any> = any; type KeyboardEvent<T=any> = any;
  type FormEvent<T=any> = any; type Dispatch<T=any> = any; type SetStateAction<T=any> = any;
  type HTMLAttributes<T=any> = any; type ElementRef<T=any> = any; type ComponentPropsWithoutRef<T=any> = any; }
declare namespace JSX { interface IntrinsicElements { [k: string]: any } type Element = any; interface ElementClass { render: any } }

declare let window: any; declare let document: any; declare let localStorage: any;
declare let console: any; declare let navigator: any; declare let Intl: any; declare let crypto: any;
declare let fetch: any; declare let process: any; declare let URL: any; declare let Blob: any;
declare let alert: any; declare let matchMedia: any; declare let performance: any;
declare function setTimeout(...a:any[]): any; declare function clearTimeout(...a:any[]): any;
declare function setInterval(...a:any[]): any; declare function clearInterval(...a:any[]): any;
declare function requestAnimationFrame(...a:any[]): any; declare function cancelAnimationFrame(...a:any[]): any;
declare type HTMLElement = any; declare type HTMLInputElement = any; declare type HTMLDivElement = any;
declare type HTMLTextAreaElement = any; declare type HTMLButtonElement = any; declare type SVGSVGElement = any;
declare type File = any; declare type FileList = any; declare type Event = any; declare type MediaQueryList = any;
