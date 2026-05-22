// 5. ВЕНТИЛЯЦІЯ ЕКРАНІВ (UI ТА ВЗАЄМОДІЯ)
function switchWorkspace(targetDeckId) {
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    document.querySelectorAll('.deck-view').forEach(view => view.classList.remove('active'));

    if (targetDeckId === 'pair') {
        document.getElementById('lnk-pair').classList.add('active');
        document.getElementById('deck-pair').classList.add('active');
        syncColorChips();
    } else {
        document.getElementById('lnk-image').classList.add('active');
        document.getElementById('deck-image').classList.add('active');
    }
}

function togglePairFormat() {
    const selectedRadioMode = document.querySelector('input[name="pairPayloadType"]:checked').value;
    const isCharacterMode = selectedRadioMode === 'char';

    document.getElementById('wrapper-payload-char').classList.toggle('hidden', !isCharacterMode);
    document.getElementById('wrapper-payload-bin').classList.toggle('hidden', isCharacterMode);
    if (isCharacterMode) renderCharTelemetry();
}

function syncColorChips() {
    const p1Val = Math.max(0, Math.min(255, parseInt(document.getElementById('node-p1').value) || 0));
    const p2Val = Math.max(0, Math.min(255, parseInt(document.getElementById('node-p2').value) || 0));

    document.getElementById('chip-p1').style.backgroundColor = `rgb(${p1Val}, ${p1Val}, ${p1Val})`;
    document.getElementById('chip-p2').style.backgroundColor = `rgb(${p2Val}, ${p2Val}, ${p2Val})`;
}

function renderCharTelemetry() {
    const letterInput = document.getElementById('payload-char').value;
    const textInfoElement = document.getElementById('telemetry-ascii');
    if (!letterInput) { textInfoElement.textContent = ''; return; }

    const processedBytes = new TextEncoder().encode(letterInput);
    const binaryCollection = Array.from(processedBytes).map(byteNode => byteNode.toString(2).padStart(8, '0'));
    textInfoElement.textContent = `UTF-8 байтів: ${processedBytes.length} | Бінарно: ${binaryCollection.join(' ')}`;
}

function displayNotification(targetConsoleId, textMessage, isFailure) {
    const statusBox = document.getElementById(targetConsoleId);
    statusBox.textContent = textMessage;
    statusBox.className = `console-status ${isFailure ? 'status-fail' : 'status-ok'}`;
}

function renderTerminalTrace(resultNode, initialSourceBits) {
    const traceContainer = document.getElementById('terminal-pvd-steps');
    document.getElementById('terminal-placeholder').classList.add('hidden');
    traceContainer.classList.remove('hidden');
    traceContainer.innerHTML = '';

    const appendLogLine = (labelTitle, computedValue, isSpecialHighlight = false, isWarningAlert = false) => {
        const elementRow = document.createElement('div');
        elementRow.className = 'terminal-row';

        let valueStyleClass = 'term-val';
        if (isSpecialHighlight) valueStyleClass = 'term-val term-highlight';
        if (isWarningAlert) valueStyleClass = 'term-val term-alert';

        elementRow.innerHTML = `<span class="term-lbl">${labelTitle}</span><span class="${valueStyleClass}">${computedValue}</span>`;
        traceContainer.appendChild(elementRow);
    };

    appendLogLine("1. Різниця d = |P₂ − P₁|", `|${resultNode.p2Original} − ${resultNode.p1Original}| = ${resultNode.currentD}`);
    appendLogLine("2. Інтервал [l, u]", `[${resultNode.lower}, ${resultNode.upper}]`);
    appendLogLine("   Кількість бітів n", `${resultNode.totalBits}`, true);

    const printableBits = initialSourceBits.length > 8 ? initialSourceBits.substring(0, 8) + "..." : initialSourceBits.padEnd(8, '?');
    appendLogLine("3. Бінарне повідомлення", printableBits);
    appendLogLine(`   Взяті ${resultNode.totalBits} бітів`, `${resultNode.bitsInjected} → b = ${resultNode.decimalValueB}`, true);

    appendLogLine("4. Нова різниця d' = l + b", `${resultNode.lower} + ${resultNode.decimalValueB} = ${resultNode.newDifferenceD}`);
    appendLogLine("5. Відхилення m = d' − d", `${resultNode.newDifferenceD} − ${resultNode.currentD} = ${resultNode.offsetM}`);
    appendLogLine("   δP₁ = ⌊|m|/2⌋", `${resultNode.d1}`);
    appendLogLine("   δP₂ = ⌈|m|/2⌉", `${resultNode.d2}`);

    const hasP2Dominance = resultNode.p2Original >= resultNode.p1Original;
    const isExpansion = resultNode.offsetM > 0;
    const dynamicSign1 = (isExpansion ^ hasP2Dominance) ? "+" : "−";
    const dynamicSign2 = (isExpansion ^ hasP2Dominance) ? "−" : "+";

    appendLogLine("6. Корекція P₁'", `P₁ ${dynamicSign1} ${resultNode.d1} = ${resultNode.p1Raw}`);
    appendLogLine("   Корекція P₂'", `P₂ ${dynamicSign2} ${resultNode.d2} = ${resultNode.p2Raw}`);

    if (resultNode.finalShift !== 0) {
        const balanceSign = resultNode.finalShift > 0 ? "+" : "−";
        appendLogLine("7. Зсув (вихід за межі)", `${balanceSign}${Math.abs(resultNode.finalShift)}`, false, true);
        appendLogLine("   P₁' після зсуву", `${resultNode.p1Raw} ${balanceSign} ${Math.abs(resultNode.finalShift)} = ${resultNode.p1Final}`, true);
        appendLogLine("   P₂' після зсуву", `${resultNode.p2Raw} ${balanceSign} ${Math.abs(resultNode.finalShift)} = ${resultNode.p2Final}`, true);
    }

    appendLogLine("✓ Перевірка |P₂' − P₁'|", `|${resultNode.p2Final} − ${resultNode.p1Final}| = ${resultNode.provenD}`);
}

function executePairEmbedding() {
    const originalP1 = parseInt(document.getElementById('node-p1').value);
    const originalP2 = parseInt(document.getElementById('node-p2').value);

    if (isNaN(originalP1) || originalP1 < 0 || originalP1 > 255 || isNaN(originalP2) || originalP2 < 0 || originalP2 > 255) {
        displayNotification('console-pair-embed-status', "Значення пікселів повинні бути від 0 до 255.", true);
        return;
    }

    let compiledBinaryBits = "";
    const activeInputType = document.querySelector('input[name="pairPayloadType"]:checked').value;

    if (activeInputType === 'char') {
        const targetedCharacter = document.getElementById('payload-char').value;
        if (!targetedCharacter) return displayNotification('console-pair-embed-status', "Введіть символ для вбудовування.", true);
        const bytesRepresentation = new TextEncoder().encode(targetedCharacter);
        compiledBinaryBits = Array.from(bytesRepresentation).map(b => b.toString(2).padStart(8, '0')).join('');
    } else {
        compiledBinaryBits = document.getElementById('payload-bin').value.trim();
        if (!/^[01]+$/.test(compiledBinaryBits)) return displayNotification('console-pair-embed-status', "Бінарний рядок має містити лише 0 та 1.", true);
    }

    const computationResult = embedInSinglePixelPair(originalP1, originalP2, compiledBinaryBits);

    // Автоматичний трансфер у поля екстракції
    document.getElementById('node-extract-p1').value = computationResult.p1Final;
    document.getElementById('node-extract-p2').value = computationResult.p2Final;

    renderTerminalTrace(computationResult, compiledBinaryBits);
    displayNotification('console-pair-embed-status', "Вбудовування виконано успішно!", false);
}

function executePairExtraction() {
    const targetExtractP1 = parseInt(document.getElementById('node-extract-p1').value);
    const targetExtractP2 = parseInt(document.getElementById('node-extract-p2').value);

    if (isNaN(targetExtractP1) || isNaN(targetExtractP2)) {
        alert("Введіть коректні значення стего-пікселів.");
        return;
    }

    const extractionOutput = extractFromSinglePixelPair(targetExtractP1, targetExtractP2);

    const layoutResultBox = document.getElementById('console-pair-extract-output');
    layoutResultBox.classList.remove('hidden');
    layoutResultBox.innerHTML = `
                <div class="terminal-log">
                    <div class="terminal-row"><span class="term-lbl">d = |P₂ − P₁|</span><span class="term-val">|${extractionOutput.p2Stego} − ${extractionOutput.p1Stego}| = ${extractionOutput.currentD}</span></div>
                    <div class="terminal-row"><span class="term-lbl">Інтервал → n бітів</span><span class="term-val">[${extractionOutput.lower}, ${extractionOutput.upper}] → n = ${extractionOutput.totalBits}</span></div>
                    <div class="terminal-row"><span class="term-lbl">b = d − l</span><span class="term-val">${extractionOutput.currentD} − ${extractionOutput.lower} = ${extractionOutput.decimalValueB}</span></div>
                    <div class="terminal-row" style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--accent-mint);">
                        <span class="term-lbl term-highlight">Вилучені біти:</span>
                        <span class="term-val term-highlight" style="font-size: 1.15rem;">${extractionOutput.binaryBits}</span>
                    </div>
                </div>
            `;
}
