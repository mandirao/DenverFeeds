import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#FE6B41]">
      <Navbar showFilters={false} />
      
      <main className="container mx-auto px-4 py-16 flex items-center justify-center">
        <Card className="w-full max-w-md mx-4 border-2 border-black bg-[#FEABDA]">
          <CardContent className="pt-6">
            <div className="flex mb-4 gap-2 items-center">
              <AlertCircle className="h-8 w-8 text-black" />
              <h1 className="text-2xl font-bold text-black">404 Page Not Found</h1>
            </div>

            <p className="mt-4 mb-6 text-black">
              Sorry, the page you were looking for doesn't exist.
            </p>
            
            <div className="flex justify-center mt-4">
              <Link href="/">
                <Button variant="default" className="bg-black text-white hover:bg-black/90 rounded-full px-6">
                  Back to Home
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
      
      <Footer />
    </div>
  );
}
