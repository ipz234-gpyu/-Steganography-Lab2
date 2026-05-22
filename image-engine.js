// 7. СТУДІЙНИЙ ПРОЦЕСОР ЗОБРАЖЕНЬ
let storageOriginalImageData = null;
let storageStegoImageData = null;
let internalUploadedFileName = "image";

function toggleImageEngineAction() {
    const isEmbeddingAction = document.querySelector('input[name="imageEngineAction"]:checked').value === 'embed';
    document.getElementById('panel-engine-embed').classList.toggle('hidden', !isEmbeddingAction);
    document.getElementById('panel-engine-extract').classList.toggle('hidden', isEmbeddingAction);
    document.getElementById('console-image-engine-status').classList.add('hidden');
}

function processIncomingImage(event) {
    const rawFileNode = event.target.files[0];
    if (!rawFileNode) return;

    internalUploadedFileName = rawFileNode.name.split('.')[0];
    const fileReaderStream = new FileReader();

    fileReaderStream.onload = function (e) {
        const temporaryImageHtml = new Image();
        temporaryImageHtml.onload = function () {
            const canvasElement = document.getElementById('view-canvas-original');
            const canvasContext = canvasElement.getContext('2d', { willReadFrequently: true });

            canvasElement.width = temporaryImageHtml.width;
            canvasElement.height = temporaryImageHtml.height;
            canvasContext.drawImage(temporaryImageHtml, 0, 0);

            storageOriginalImageData = canvasContext.getImageData(0, 0, canvasElement.width, canvasElement.height);

            forceGrayscaleTransformation(storageOriginalImageData);
            canvasContext.putImageData(storageOriginalImageData, 0, 0);

            document.getElementById('text-studio-placeholder').classList.add('hidden');
            canvasElement.classList.remove('hidden');

            const systemTotalCapacityBits = calculateTotalImageCapacity(storageOriginalImageData);
            const netCapacityBytes = Math.floor((systemTotalCapacityBits - PVD_SETTINGS.METADATA_LENGTH_BYTES * PVD_SETTINGS.BITS_PER_UNIT) / PVD_SETTINGS.BITS_PER_UNIT);

            const telemetryContainer = document.getElementById('meta-image-telemetry');
            telemetryContainer.innerHTML = `
                        <li class="telemetry-item"><span class="term-lbl">Розмір зображення</span><span class="term-val">${temporaryImageHtml.width} × ${temporaryImageHtml.height} пікс.</span></li>
                        <li class="telemetry-item"><span class="term-lbl">Ємність зображення</span><span class="term-val">${systemTotalCapacityBits} біт</span></li>
                        <li class="telemetry-item"><span class="term-lbl">Максимальна довжина</span><span class="term-val term-highlight">~${netCapacityBytes} байт</span></li>
                    `;

            document.getElementById('view-canvas-stego').classList.add('hidden');
            document.getElementById('text-stego-placeholder').classList.remove('hidden');
            document.getElementById('action-download-stego').classList.add('hidden');
            document.getElementById('telemetry-stego-metrics').innerHTML = '';
            document.getElementById('field-extracted-payload').value = '';
            document.getElementById('console-image-engine-status').classList.add('hidden');
        };
        temporaryImageHtml.src = e.target.result;
    };
    fileReaderStream.readAsDataURL(rawFileNode);
}

function runImageEmbeddingEngine() {
    if (!storageOriginalImageData) return displayNotification('console-image-engine-status', "Спочатку завантажте зображення.", true);

    const messagePayloadText = document.getElementById('field-secret-payload').value;
    if (!messagePayloadText) return displayNotification('console-image-engine-status', "Введіть текст для приховування.", true);

    const continuousBitstream = transformStringToBitstream(messagePayloadText);
    const absoluteImageCapacityBits = calculateTotalImageCapacity(storageOriginalImageData);

    if (continuousBitstream.length > absoluteImageCapacityBits) {
        return displayNotification('console-image-engine-status', `Повідомлення занадто велике. Потрібно ${continuousBitstream.length} біт, ємність: ${absoluteImageCapacityBits} біт.`, true);
    }

    storageStegoImageData = new ImageData(
        new Uint8ClampedArray(storageOriginalImageData.data),
        storageOriginalImageData.width,
        storageOriginalImageData.height
    );

    const rawMatrixData = storageStegoImageData.data;
    const imgWidth = storageStegoImageData.width;
    const imgHeight = storageStegoImageData.height;
    let bitstreamCursor = 0;
    const totalPayloadBitsCount = continuousBitstream.length;

    for (let yCoord = 0; yCoord < imgHeight && bitstreamCursor < totalPayloadBitsCount; yCoord++) {
        for (let xCoord = 0; xCoord + 1 < imgWidth && bitstreamCursor < totalPayloadBitsCount; xCoord += 2) {
            const firstChannelIndex = (yCoord * imgWidth + xCoord) * 4;
            const secondChannelIndex = (yCoord * imgWidth + xCoord + 1) * 4;

            const lumaPixel1 = rawMatrixData[firstChannelIndex];
            const lumaPixel2 = rawMatrixData[secondChannelIndex];
            const absoluteDelta = Math.abs(lumaPixel2 - lumaPixel1);
            const singleBlockBitsCapacity = resolveIntervalMetrics(absoluteDelta).bitsCount;

            const subSegmentBitsChunk = continuousBitstream.substring(bitstreamCursor, bitstreamCursor + singleBlockBitsCapacity).padEnd(singleBlockBitsCapacity, '0');
            bitstreamCursor += singleBlockBitsCapacity;

            const coreEmbeddingResult = embedInSinglePixelPair(lumaPixel1, lumaPixel2, subSegmentBitsChunk);

            rawMatrixData[firstChannelIndex] = rawMatrixData[firstChannelIndex + 1] = rawMatrixData[firstChannelIndex + 2] = coreEmbeddingResult.p1Final;
            rawMatrixData[secondChannelIndex] = rawMatrixData[secondChannelIndex + 1] = rawMatrixData[secondChannelIndex + 2] = coreEmbeddingResult.p2Final;
        }
    }

    const targetStegoCanvas = document.getElementById('view-canvas-stego');
    const stegoCanvasContext = targetStegoCanvas.getContext('2d');
    targetStegoCanvas.width = imgWidth;
    targetStegoCanvas.height = imgHeight;
    stegoCanvasContext.putImageData(storageStegoImageData, 0, 0);

    document.getElementById('text-stego-placeholder').classList.add('hidden');
    targetStegoCanvas.classList.remove('hidden');
    document.getElementById('action-download-stego').classList.remove('hidden');

    const factorPercentageUsed = ((totalPayloadBitsCount / absoluteImageCapacityBits) * 100).toFixed(2);
    document.getElementById('telemetry-stego-metrics').innerHTML = `
                <div style="margin-top: 1rem; border-top: 1px solid var(--border-tech); padding-top: 1rem;">
                    <div>• Повідомлення: ${messagePayloadText.length} символів</div>
                    <div>• З заголовком: ${totalPayloadBitsCount} біт</div>
                    <div>• Використано ємності: <span style="color: var(--accent-mint); font-weight: bold;">${factorPercentageUsed}%</span></div>
                </div>
            `;

    displayNotification('console-image-engine-status', "Повідомлення успішно вбудовано!", false);
}

function runImageExtractionEngine() {
    if (!storageOriginalImageData) return displayNotification('console-image-engine-status', "Спочатку завантажте зображення.", true);

    const matrixBytes = storageOriginalImageData.data;
    const currentImgWidth = storageOriginalImageData.width;
    const currentImgHeight = storageOriginalImageData.height;

    let accumulatedBinaryStreamBits = "";
    let decodedByteSizeHeader = null;
    let criticalBitsTargetLimit = PVD_SETTINGS.METADATA_LENGTH_BYTES * PVD_SETTINGS.BITS_PER_UNIT;

    try {
        for (let rY = 0; rY < currentImgHeight && accumulatedBinaryStreamBits.length < criticalBitsTargetLimit; rY++) {
            for (let cX = 0; cX + 1 < currentImgWidth && accumulatedBinaryStreamBits.length < criticalBitsTargetLimit; cX += 2) {
                const cellIndex1 = (rY * currentImgWidth + cX) * 4;
                const cellIndex2 = (rY * currentImgWidth + cX + 1) * 4;

                const pixelComponent1 = matrixBytes[cellIndex1];
                const pixelComponent2 = matrixBytes[cellIndex2];

                const extractionPairPacket = extractFromSinglePixelPair(pixelComponent1, pixelComponent2);
                accumulatedBinaryStreamBits += extractionPairPacket.binaryBits;

                if (decodedByteSizeHeader === null && accumulatedBinaryStreamBits.length >= criticalBitsTargetLimit) {
                    const temporaryHeaderSubstring = accumulatedBinaryStreamBits.substring(0, criticalBitsTargetLimit);
                    decodedByteSizeHeader = parseInt(temporaryHeaderSubstring, 2);

                    if (decodedByteSizeHeader <= 0 || decodedByteSizeHeader > PVD_SETTINGS.CRITICAL_CAPACITY_LIMIT_BYTES) {
                        throw new Error("Зображення не містить прихованих даних або дані пошкоджені.");
                    }
                    criticalBitsTargetLimit += decodedByteSizeHeader * PVD_SETTINGS.BITS_PER_UNIT;
                }
            }
        }

        if (decodedByteSizeHeader !== null && accumulatedBinaryStreamBits.length >= criticalBitsTargetLimit) {
            const truePayloadBitsOnly = accumulatedBinaryStreamBits.substring(PVD_SETTINGS.METADATA_LENGTH_BYTES * PVD_SETTINGS.BITS_PER_UNIT, criticalBitsTargetLimit);
            const rawReconstructedBytes = transformBitstreamToBytes(truePayloadBitsOnly, decodedByteSizeHeader);
            const finalReconstructedText = convertBytesToString(rawReconstructedBytes);

            document.getElementById('field-extracted-payload').value = finalReconstructedText;
            displayNotification('console-image-engine-status', "Повідомлення успішно вилучено!", false);
        } else {
            throw new Error("Недостатньо даних для повного вилучення.");
        }

    } catch (runtimeException) {
        displayNotification('console-image-engine-status', runtimeException.message, true);
    }
}

function triggerStegoDownload() {
    const activeStegoCanvas = document.getElementById('view-canvas-stego');
    if (activeStegoCanvas.classList.contains('hidden')) return;

    const temporaryAnchorLink = document.createElement('a');
    temporaryAnchorLink.download = `${internalUploadedFileName}_stego_pvd.png`;
    temporaryAnchorLink.href = activeStegoCanvas.toDataURL("image/png");
    temporaryAnchorLink.click();
}
