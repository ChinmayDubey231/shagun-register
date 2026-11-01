package expo.modules.invitetext

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizerOptionsInterface
import com.google.mlkit.vision.text.devanagari.DevanagariTextRecognizerOptions
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Reads the text on an invite card photo with ML Kit, on the phone. Each photo is read
 * twice, by the Latin and the Devanagari recognizer, and every line comes back with its
 * position and confidence so the app can keep the better reading of each part of the card.
 */
class InviteTextModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("InviteText")

    AsyncFunction("recognize") Coroutine { uri: String ->
      val context = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "The app isn't ready yet", null)
      val image = try {
        InputImage.fromFilePath(context, Uri.parse(uri))
      } catch (e: Exception) {
        throw CodedException("ERR_IMAGE_UNREADABLE", "Couldn't open the photo", e)
      }
      mapOf(
        "latin" to read(image, TextRecognizerOptions.DEFAULT_OPTIONS),
        "devanagari" to read(image, DevanagariTextRecognizerOptions.Builder().build()),
      )
    }
  }

  private suspend fun read(image: InputImage, options: TextRecognizerOptionsInterface): List<Map<String, Any>> {
    val recognizer = TextRecognition.getClient(options)
    try {
      val text: Text = suspendCancellableCoroutine { continuation ->
        recognizer.process(image)
          .addOnSuccessListener { continuation.resume(it) }
          .addOnFailureListener { continuation.resumeWithException(CodedException("ERR_RECOGNITION_FAILED", it.message, it)) }
      }
      return text.textBlocks.flatMap { block ->
        block.lines.map { line ->
          val box = line.boundingBox
          mapOf(
            "text" to line.text,
            "left" to (box?.left ?: 0),
            "top" to (box?.top ?: 0),
            "width" to (box?.width() ?: 0),
            "height" to (box?.height() ?: 0),
            "confidence" to line.confidence.toDouble(),
          )
        }
      }
    } finally {
      recognizer.close()
    }
  }
}
