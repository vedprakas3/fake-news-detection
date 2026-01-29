document.getElementById('newsForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    const newsText = document.getElementById('newsInput').value.trim();
    if (!newsText) return;

    // Show loading state
    const button = document.querySelector('.btn-primary');
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Researching...';
    button.disabled = true;

    try {
        const response = await fetch('/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ newsText }),
        });

        const data = await response.json();

        if (response.ok) {
            let resultText = `This news appears to be ${data.result}.`;
            if (data.hasOfficialSources) {
                resultText += ' Found on official sources.';
            }
            resultText += ` Sources found: ${data.sourcesFound}`;

            if (data.explanation) {
                resultText += `\n\nExplanation: ${data.explanation}`;
            }

            document.getElementById('resultText').textContent = resultText;
            document.getElementById('confidenceScore').textContent = data.confidence + '%';
            document.getElementById('progressFill').style.width = data.confidence + '%';
            document.getElementById('result').className = `result ${data.result.toLowerCase()}`;
            document.getElementById('result').classList.remove('hidden');

            // Display search results
            if (data.searchResults && data.searchResults.length > 0) {
                let sourcesHtml = '<h3>Sources Found:</h3><ul>';
                data.searchResults.forEach(result => {
                    sourcesHtml += `<li><a href="${result.url}" target="_blank">${result.title}</a><br><small>${result.snippet}</small></li>`;
                });
                sourcesHtml += '</ul>';
                document.getElementById('sourcesList').innerHTML = sourcesHtml;
                document.getElementById('sources').classList.remove('hidden');
            }
        } else {
            document.getElementById('resultText').textContent = 'Error: ' + data.error;
            document.getElementById('result').className = 'result error';
            document.getElementById('result').classList.remove('hidden');
        }
    } catch (error) {
        document.getElementById('resultText').textContent = 'Network error. Please try again.';
        document.getElementById('result').className = 'result error';
        document.getElementById('result').classList.remove('hidden');
    }

    // Reset button
    button.innerHTML = originalText;
    button.disabled = false;
});
