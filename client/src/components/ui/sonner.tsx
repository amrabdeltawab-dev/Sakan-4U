import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      dir="rtl"
      position="top-center"
      className="toaster group sakan4u-toaster"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "#dbe6f0",
          "--success-bg": "#ecfdf5",
          "--success-text": "#047857",
          "--success-border": "#bbf7d0",
          "--error-bg": "#fff1f2",
          "--error-text": "#b91c1c",
          "--error-border": "#fecdd3",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
