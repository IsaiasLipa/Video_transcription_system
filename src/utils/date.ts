export function isWithinLastMonth(date: Date | string | null | undefined): boolean {
    if (!date) {
        return false;
    }
    const now = new Date();
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(now.getMonth() - 1);
    
    const parsed = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(parsed.getTime())) {
        return false;
    }
    return parsed >= oneMonthAgo;
}
