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

/**
 * Archive years that can contain videos from the last month.
 * In January the window reaches back into December, so the previous year is included too.
 */
export function archiveYears(now: Date = new Date()): number[] {
    const year = now.getFullYear();
    return now.getMonth() === 0 ? [year, year - 1] : [year];
}
