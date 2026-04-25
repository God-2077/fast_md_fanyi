export class Logger {
    constructor(private level: "info" | "debug" = "info") {
        console.log("Logger initialized");
    }
    info(message: string) {
        const localTime = new Date().toLocaleString();
        console.log(`${localTime} INFO ${message}`);
    }
    error(message: string) {
        const localTime = new Date().toLocaleString();
        console.error(`${localTime} ERROR ${message}`);
    }
    warn(message: string) {
        const localTime = new Date().toLocaleString();
        console.warn(`${localTime} WARN ${message}`);
    }
    debug(message: string) {
        if (this.level !== "debug") return;
        const localTime = new Date().toLocaleString();
        console.debug(`${localTime} DEBUG ${message}`);
    }
}