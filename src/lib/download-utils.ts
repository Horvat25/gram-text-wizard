import html2canvas from "html2canvas";
import JSZip from "jszip";

/**
 * Baixa tudo (imagem, legenda e preview) em um único arquivo ZIP
 */
export const downloadAllAsZip = async (
  imageUrl: string,
  caption: string,
  hashtags: string[],
  previewElement: HTMLElement,
  folderName: string = "post-instagram"
) => {
  try {
    const zip = new JSZip();
    const folder = zip.folder(folderName);
    
    if (!folder) throw new Error("Erro ao criar pasta ZIP");

    // 1. Adicionar imagem
    if (imageUrl) {
      const imageResponse = await fetch(imageUrl);
      const imageBlob = await imageResponse.blob();
      folder.file("imagem.jpg", imageBlob);
    }

    // 2. Adicionar legenda
    const hashtagsText = hashtags.map(tag => `#${tag}`).join(" ");
    const captionContent = `${caption}\n\n${hashtagsText}`;
    folder.file("legenda.txt", captionContent);

    // 3. Adicionar preview como imagem
    const canvas = await html2canvas(previewElement, {
      backgroundColor: "#ffffff",
      scale: 2,
      logging: false,
      useCORS: true,
    });
    
    const previewBlob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob!);
      });
    });
    folder.file("preview-instagram.png", previewBlob);

    // Gerar e baixar ZIP
    const content = await zip.generateAsync({ type: "blob" });
    const url = window.URL.createObjectURL(content);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${folderName}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Erro ao criar ZIP:", error);
    throw error;
  }
};

/**
 * Copia texto para a área de transferência
 */
export const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error("Erro ao copiar:", error);
    return false;
  }
};
