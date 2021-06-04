module.exports = () => {
	const warp = document.createDocumentFragment();
	const historyTR = document.createElement('tr');
	const historyTD = document.createElement('td');
	historyTR.append(historyTD);
	historyTR.className = 'bc-history';

	function collapseHistory() {
		document.querySelectorAll('td[aria-expanded="true"]').forEach(node => node.setAttribute('aria-expanded', 'false'));
		warp.append(historyTR);
		historyTD.textContent = '';
	}

	function expandHistory(td) {
		const tr = td.closest('tr');
		const columnNumber = tr.children.length;
		historyTD.setAttribute('colspan', columnNumber);

		const notes = td.querySelector('dl.bc-history');
		historyTD.append(notes.cloneNode(true));

		tr.after(historyTR);
	}

	document.body.addEventListener('click', (e) => {
		const target = e.target.closest('td.bc-has-history');
		if (!target) {
			return;
		}

		const wasExpanded = target.getAttribute('aria-expanded').toLowerCase() === 'true';
		const isExpanded = !wasExpanded;

		collapseHistory();
		target.setAttribute('aria-expanded', isExpanded);
		if (isExpanded) {
			expandHistory(target);
		}
	});
};
