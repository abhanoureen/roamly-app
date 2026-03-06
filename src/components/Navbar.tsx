import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";

const Navbar = () => {
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
      <div className="flex h-16 w-full items-center justify-between px-4 md:px-6">
        <Link to="/" className="flex items-center gap-2">
          <MapPin className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold tracking-tight text-foreground">
            Roam<span className="text-primary">ly</span>
          </span>
        </Link>
      </div>
    </nav>
  );
};

export default Navbar;
