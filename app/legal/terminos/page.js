"use client";

import { LegalPage } from "../LegalPage";

export default function TerminosPage() {
  return (
    <LegalPage title="Términos de uso" updated="septiembre de 2026">
      <h2>1. Qué es este servicio</h2>
      <p>
        Esta web permite reservar citas en <strong>Peluquería Caballero Fennani Barbershop</strong>{" "}
        (C. Pedro de Valdivia 3, 28911 Leganés, Madrid) y encargar productos para recogerlos en el
        local. Al usar la web aceptas estos términos y la{" "}
        <a href="/legal/privacidad">política de privacidad</a>.
      </p>

      <h2>2. Tu cuenta de cliente</h2>
      <p>
        Para reservar o hacer pedidos necesitas una ficha de cliente, identificada con tu teléfono
        y un <strong>código de acceso personal</strong>. Ese código funciona como tu contraseña:
        guárdalo y no lo compartas. Puedes cambiarlo cuando quieras desde "Mis citas". Si lo
        pierdes, llámanos y te ayudaremos a recuperarlo. Te comprometes a facilitar datos veraces y
        a usar únicamente tu propia ficha.
      </p>

      <h2>3. Citas</h2>
      <p>
        Las citas se confirman en el momento de la reserva, siempre que el hueco siga libre. Puedes
        cancelarlas desde "Mis citas" hasta <strong>2 horas antes</strong>; con menos antelación,
        llámanos por teléfono. Para un uso justo del servicio, cada cliente puede tener un máximo
        de <strong>3 citas pendientes</strong> a la vez reservadas desde la web. Si no puedes
        acudir, te pedimos que canceles: ese hueco lo aprovechará otro cliente. La peluquería se
        reserva el derecho de cancelar o reprogramar una cita por causas justificadas (enfermedad,
        fuerza mayor…), avisándote por los medios de contacto que hayas facilitado.
      </p>

      <h2>4. Pedidos de productos</h2>
      <p>
        Los pedidos se preparan para <strong>recoger y pagar en el local</strong>; la web no cobra
        ningún importe. Los precios mostrados incluyen los impuestos aplicables. Puedes cancelar un
        pedido pendiente desde "Mis citas". Si un producto no estuviera finalmente disponible, te
        avisaremos y no tendrás ninguna obligación de compra.
      </p>

      <h2>5. Reseñas</h2>
      <p>
        Solo pueden publicarse reseñas de citas ya realizadas. Al enviar una reseña garantizas que
        es tu opinión real y autorizas a la peluquería a mostrarla en esta web (con tu nombre de
        pila). No se admiten contenidos ofensivos, falsos o ajenos al servicio; las reseñas pasan
        por moderación y la peluquería puede no publicar o retirar las que incumplan estas normas.
      </p>

      <h2>6. Uso correcto de la web</h2>
      <p>
        No está permitido usar la web de forma fraudulenta o abusiva: reservar con datos falsos o
        de terceros, intentar acceder a fichas ajenas, saturar el sistema o interferir en su
        funcionamiento. El sistema aplica límites técnicos automáticos y la peluquería puede
        bloquear el acceso de quien incumpla estas normas.
      </p>

      <h2>7. Responsabilidad</h2>
      <p>
        La peluquería pone los medios razonables para que la web funcione correctamente, pero no
        puede garantizar una disponibilidad ininterrumpida (mantenimientos, incidencias de los
        proveedores de alojamiento, etc.). En caso de incidencia con tu cita siempre puedes
        contactarnos por teléfono. Nada en estos términos limita los derechos que te reconoce la
        legislación de consumo.
      </p>

      <h2>8. Cambios y legislación aplicable</h2>
      <p>
        Podemos actualizar estos términos publicando aquí la nueva versión con su fecha. Estos
        términos se rigen por la legislación española; cualquier controversia se someterá a los
        juzgados y tribunales que correspondan conforme a la normativa de consumidores y usuarios.
      </p>
    </LegalPage>
  );
}
