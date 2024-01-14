import express from "express";
import { FileGenerator } from "../services/FileGeneratorService";

module.exports = (fileGenerator: FileGenerator) => {
    const router = express.Router();
    // files generation request
    router.post('/files', async (req: any, res: any) => {
        const numFiles = req.body.numFiles;
        const numPerFile = req.body.numPerFile;
        if (!numFiles || !numPerFile) {
            res.status(400).json({ message: "Missing required data" });
            return;
        }
        const files = await fileGenerator.generateFiles(numFiles, numPerFile);
        console.log(files)
        res.status(200).json(files);
    });
    return router;
};