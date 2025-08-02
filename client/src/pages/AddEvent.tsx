import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Navbar } from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useToast } from "@/hooks/use-toast";
import EventForm, { EventFormValues } from "@/components/EventForm";
import { Button } from "@/components/ui/button";
import { Bot, Search } from "lucide-react";

export default function AddEvent() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  // Add single event mutation
  const addEventMutation = useMutation({
    mutationFn: async (data: EventFormValues) => {
      return apiRequest({
        endpoint: "/api/events",
        method: "POST",
        data
      });
    },
    onSuccess: () => {
      toast({
        title: "Event Added",
        description: "The event has been added successfully!",
      });
      navigate("/");
    },
    onError: (error: any) => {
      console.error("Single event add error:", error);
      
      if (error.response?.status === 409 || error.message?.includes("already exists")) {
        setDuplicateError("This event already exists in the database.");
      } else if (error.response?.status === 400) {
        // Handle validation errors
        toast({
          title: "Validation Error",
          description: error.response?.data?.message || "Please check your form inputs.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to add event. Please try again.",
          variant: "destructive",
        });
      }
    },
  });

  // Concert discovery mutation
  const discoveryMutation = useMutation({
    mutationFn: async () => {
      return apiRequest({
        endpoint: "/api/discover-concerts",
        method: "POST"
      });
    },
    onSuccess: () => {
      toast({
        title: "Concert Discovery Complete",
        description: "Found and added new events to the feed!",
      });
    },
    onError: (error: any) => {
      console.error("Discovery error:", error);
      toast({
        title: "Discovery Failed",
        description: "Could not discover new events. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Handle form submission
  const handleSubmit = (data: EventFormValues) => {
    setDuplicateError(null);
    addEventMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-[#FE6B41]">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8">
        {/* Manual Discovery Button */}
        <div className="mb-6 bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bot className="w-5 h-5 text-orange-600" />
              <div>
                <h3 className="font-semibold text-gray-900">Auto-Discovery</h3>
                <p className="text-sm text-gray-600">Find and add relevant concerts automatically</p>
              </div>
            </div>
            <Button
              onClick={() => discoveryMutation.mutate()}
              disabled={discoveryMutation.isPending}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Search className="w-4 h-4" />
              {discoveryMutation.isPending ? "Searching..." : "Discover Now"}
            </Button>
          </div>
        </div>

        <div className="bg-[#FEABDA] rounded-lg p-6">
          <h2 className="text-2xl text-black mb-6 font-anton font-black uppercase">ADD A SHOW</h2>
          
          <EventForm 
            onSubmit={handleSubmit}
            isPending={addEventMutation.isPending}
            duplicateError={duplicateError}
            submitButtonText="ADD SHOW"
          />
        </div>
      </main>
      <Footer />
    </div>
  );
}
