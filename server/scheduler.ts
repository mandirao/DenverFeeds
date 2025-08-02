import { concertDiscovery } from './concert-discovery';

export class ConcertScheduler {
  private weeklyIntervalId: NodeJS.Timeout | null = null;

  // Start the weekly automation (runs every Monday at 9 AM)
  startWeeklyAutomation(): void {
    // Stop existing timer if running
    this.stopWeeklyAutomation();

    // Calculate time until next Monday 9 AM
    const now = new Date();
    const nextMonday = this.getNextMonday(now);
    nextMonday.setHours(9, 0, 0, 0); // 9 AM

    const timeUntilNextMonday = nextMonday.getTime() - now.getTime();

    console.log(`⏰ Concert discovery scheduled for next Monday: ${nextMonday.toLocaleString()}`);

    // Set timeout for first run
    setTimeout(() => {
      // Run the discovery immediately
      this.runDiscovery();

      // Then set up weekly interval (7 days = 604800000 ms)
      this.weeklyIntervalId = setInterval(() => {
        this.runDiscovery();
      }, 7 * 24 * 60 * 60 * 1000);

    }, timeUntilNextMonday);
  }

  // Stop the weekly automation
  stopWeeklyAutomation(): void {
    if (this.weeklyIntervalId) {
      clearInterval(this.weeklyIntervalId);
      this.weeklyIntervalId = null;
      console.log('⏹️  Weekly concert discovery automation stopped');
    }
  }

  // Run discovery manually
  async runDiscovery(): Promise<void> {
    try {
      console.log('🚀 Starting scheduled concert discovery...');
      await concertDiscovery.runWeeklyDiscovery();
      console.log('✅ Scheduled concert discovery completed successfully');
    } catch (error) {
      console.error('❌ Scheduled concert discovery failed:', error);
    }
  }

  // Get next Monday's date
  private getNextMonday(date: Date): Date {
    const nextMonday = new Date(date);
    const daysUntilMonday = (8 - nextMonday.getDay()) % 7;
    nextMonday.setDate(nextMonday.getDate() + (daysUntilMonday === 0 ? 7 : daysUntilMonday));
    return nextMonday;
  }
}

export const concertScheduler = new ConcertScheduler();

// Start automation when module loads
concertScheduler.startWeeklyAutomation();