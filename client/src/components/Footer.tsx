import { Link } from "wouter";
import { useState } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export function Footer() {
  const [aboutOpen, setAboutOpen] = useState(false);
  
  return (
    <footer className="bg-[#FE6B41] py-4 mt-8">
      <div className="container mx-auto px-4 flex flex-col sm:flex-row justify-between items-center">
        <div className="flex space-x-4 mb-4 sm:mb-0">
          <Link href="/add" className="text-black hover:text-[#41F2EE] transition-colors font-sora flex items-center">
            <Plus className="w-4 h-4 mr-1" /> ADD SHOW
          </Link>
          <button 
            onClick={() => setAboutOpen(true)}
            className="text-black hover:text-[#41F2EE] transition-colors font-sora"
          >
            ABOUT US
          </button>
        </div>
        
        <div className="text-sm text-black">
          © {new Date().getFullYear()} Setlist Social Feed
        </div>
      </div>
      
      {/* About Dialog */}
      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent className="bg-[#F4F2EA] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-anton">ABOUT SETLIST SOCIAL</DialogTitle>
          </DialogHeader>
          <DialogDescription className="text-black">
            <p className="mb-4">
              Setlist Social is a not-for-profit, fan-run hub for music lovers in our meetup group to share upcoming shows and stay in the loop with friends.
            </p>
            <p className="mb-4">
              We don't own or claim any copyrighted material. If something here steps on any toes, let us know and we'll take it down, no fuss. Questions or concerns? Drop us a note through our Meetup group.
            </p>
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline2" onClick={() => setAboutOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </footer>
  );
}

export default Footer;