import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogOverlay
} from "@/components/ui/dialog"

interface WelcomeBackModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenPopulated: () => void
}

export function WelcomeBackModal({ open, onOpenChange, onOpenPopulated }: WelcomeBackModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogOverlay className="hidden" />
      <DialogContent 
        className="sm:max-w-[360px] w-[360px] max-h-[90vh] border-0 shadow-none duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 !data-[state=closed]:slide-out-to-none !data-[state=open]:slide-in-from-none !data-[state=closed]:zoom-out-0 !data-[state=open]:zoom-in-0 [&>button]:hidden bg-white dark:bg-[#1C1C1E]"
        style={{ 
          padding: '24px'
        }}>
        <div className="flex flex-col items-center">
          {/* Logo */} 
          <img src={chrome.runtime.getURL('assets/konta_logo.svg')}  alt="Konta" className="w-12 h-12 -mt-2" />
          
          <DialogTitle className="text-2xl font-normal text-center mt-4 text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
            Welcome back to Konta!
          </DialogTitle>
        
          <p className="text-center text-sm leading-snug mt-4 text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
            Your browsing memory is ready to continue.
          </p>
        
          <p className="text-center text-xs leading-snug mt-3 text-[#9A9FA6] dark:text-[#9A9FA6]" style={{ fontFamily: "'Breeze Sans'" }}>
            Sessions are stored locally on this device
          </p>
          <p className="text-center text-xs leading-snug mt-1 text-[#9A9FA6] dark:text-[#9A9FA6]" style={{ fontFamily: "'Breeze Sans'" }}>
            Nothing is shared automatically
          </p>
          <Button 
            onClick={onOpenPopulated}
            className="font-normal h-10 mt-4 border-0 text-[#9A9FA6] dark:text-[#9A9FA6] focus:outline-none focus:ring-0 active:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 rounded-full px-6"
            style={{ backgroundColor: 'var(--primary)', fontFamily: "'Breeze Sans'", border: 'none', outline: 'none', boxShadow: 'none' }}>
            Open Memory Timeline
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
