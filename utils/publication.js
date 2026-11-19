// Regras de compatibilidade para documentos criados antes da publicação.
// A ausência do campo significa conteúdo legado e, portanto, visível.

function visibleDocumentQuery(field = "published") {
  return {
    $or: [
      { [field]: true },
      { [field]: { $exists: false } },
    ],
  };
}

function isVisible(value) {
  return value !== false;
}

module.exports = {
  visibleDocumentQuery,
  isVisible,
};
