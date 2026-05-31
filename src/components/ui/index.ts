// Shadcn components
export { Button, buttonVariants } from "./Button";
export type { ButtonProps } from "./Button";
export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from "./Card";
export { Input } from "./Input";
export type { InputProps } from "./Input";
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./Tabs";
export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "./dialog";
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
} from "./select";
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "./tooltip";
export { ScrollArea, ScrollBar } from "./scroll-area";
export { Separator } from "./separator";

// Kept custom (domain-specific)
export { default as Badge } from "./Badge";
export { ToastProvider, ToastContainer, useToast } from "./Toast";
export type { ToastItem, ToastVariant } from "./Toast";

// Kept for backward compatibility during migration (Phase 3)
export { default as Modal } from "./Modal";
