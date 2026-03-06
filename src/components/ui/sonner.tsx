import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="bottom-right"
      duration={3000}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success: "group-[.toaster]:!bg-emerald-50 group-[.toaster]:!text-emerald-800 group-[.toaster]:!border-emerald-200",
          error: "group-[.toaster]:!bg-red-50 group-[.toaster]:!text-red-800 group-[.toaster]:!border-red-200",
          info: "group-[.toaster]:!bg-teal-50 group-[.toaster]:!text-teal-800 group-[.toaster]:!border-teal-200",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
