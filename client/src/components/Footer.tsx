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

export function Footer() {
  const [aboutOpen, setAboutOpen] = useState(false);
  
  return (
    <footer className="bg-[#FEABDA] py-4 mt-8">
      <div className="container mx-auto px-4 flex flex-col sm:flex-row justify-between items-center">
        <div className="flex space-x-4 mb-4 sm:mb-0">
          <Link href="/add">
            <a className="text-black hover:text-[#F4F2EA] transition-colors font-sora">ADD EVENT</a>
          </Link>
          <button 
            onClick={() => setAboutOpen(true)}
            className="text-black hover:text-[#F4F2EA] transition-colors font-sora"
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
              Setlist Social is a not-for-profit community platform created to help music lovers discover and share upcoming shows with friends.
            </p>
            <p className="mb-4">
              Our community is built around the love of live music and creating connections between fans, artists, and venues in our local scene.
            </p>
            <p className="mb-4">
              This is a fan-run site intended for sharing information between friends. Any copyrighted content is used unintentionally, and we will promptly remove any content upon request from the rightful owner.
            </p>
            <p>
              For any questions or concerns, please reach out to us through our Meetup group.
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