import express from "express";
import { IWorkerService } from "../interfaces/IWorkerService";

module.exports = (workerService: IWorkerService) => {
    const router = express.Router();
    router.post('/worker', async (req: any, res: any) => {
        const numWorkers = req.body.numWorkers;
        if (!numWorkers) {
            res.status(400).json({ message: "Missing numWorkers field" });
            return;
        }
        await workerService.init(numWorkers);
        res.status(200).json("Workers initialized");
    });
    router.get('/worker', async (req: any, res: any) => {
        const workers = workerService.getWorkers();
        res.status(200).json(workers);
    }
    );
    // update worker status
    router.post('/worker/:workerId/status', async (req: any, res: any) => {
        const workerId = req.params.workerId;
        const status = req.body.status;
        if (!status) {
            res.status(400).json({ message: "Missing status field" });
            return;
        }
        const worker = workerService.updateWorkerStatus(workerId, status);
        if (!worker) {
            res.status(404).json({ message: "Worker not found" });
            return;
        }
        res.status(200).json(worker);
    }
    );
    return router;
};