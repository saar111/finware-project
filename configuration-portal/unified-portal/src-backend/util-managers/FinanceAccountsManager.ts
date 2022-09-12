import { CompanyTypes, createScraper, ScraperOptions } from 'israeli-bank-scrapers';
import { ScaperScrapingResult } from 'israeli-bank-scrapers/lib/scrapers/base-scraper';

const FAILURE_SCREENSHOT_DIR = "./build/static/media";

export default async function scrapeFinancialBE(account, company: String, startDate: Date, failureScreenshotPath=null): Promise<ScaperScrapingResult> {
    let options: ScraperOptions;
    options = {
        companyId: company as CompanyTypes,
        verbose: true,
        startDate: startDate,
        combineInstallments: false,
        storeFailureScreenShotPath: failureScreenshotPath && FAILURE_SCREENSHOT_DIR + `/${failureScreenshotPath}.jpg`,
        showBrowser: process.env.NODE_ENV?.toLowerCase().includes('dev'),
    };

    // Scrape is existing results are outdated
    const scrapeResult = await createScraper(options).scrape(account);
    var totalAmount = 0;
    if (scrapeResult.success) {
        console.log(scrapeResult.accounts);
        scrapeResult.accounts.forEach((account) => {
            console.log(`found ${account.txns.length} transactions for account number ${account.accountNumber}`);
            account.txns.forEach((txn) => {
                totalAmount += txn.chargedAmount;
                // console.log(`Transaction ${txn.description}, with amount: ${txn.chargedAmount} is ${txn.status}`);
            })
        });
        console.log('Total for ', account.name, ' is ', totalAmount);
    }

    return scrapeResult;
}
