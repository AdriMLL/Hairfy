"use client";

import { LegalPage } from "../LegalPage";

export default function AvisoLegalPage() {
  return (
    <LegalPage title="Aviso legal y propiedad intelectual" updated="septiembre de 2026">
      <h2>1. Titular del sitio</h2>
      <p>
        Este sitio web es titularidad de <strong>Peluquería Caballero Fennani Barbershop</strong>,
        con establecimiento en C. Pedro de Valdivia 3, 28911 Leganés (Madrid). Contacto:{" "}
        <a href="mailto:fennanibarbershop@gmail.com">fennanibarbershop@gmail.com</a> · 627 55 61 51.
      </p>

      <h2>2. Propiedad intelectual e industrial</h2>
      <p>
        El diseño de esta web, su código, sus textos, su logotipo y el nombre comercial "Fennani
        Barbershop" pertenecen al titular del sitio o se usan con su autorización, y están
        protegidos por la normativa de propiedad intelectual e industrial. No está permitido
        reproducirlos, distribuirlos o transformarlos sin autorización expresa, salvo para el uso
        normal de la web como cliente.
      </p>
      <p>
        Los elementos de terceros que aparecen en la web pertenecen a sus respectivos titulares:
        el mapa embebido y las fotografías y valoraciones procedentes del perfil del negocio en
        Google se muestran a través de los servicios de Google y se rigen por sus condiciones.
        Las reseñas publicadas por los clientes son de sus autores, que autorizan su publicación
        en esta web al enviarlas.
      </p>

      <h2>3. Uso del sitio</h2>
      <p>
        El acceso a la web es gratuito y no requiere registro previo para consultar la
        información. El usuario se compromete a hacer un uso lícito del sitio, conforme a estos
        términos, al <a href="/legal/terminos">acuerdo de uso</a> y a la legislación vigente.
      </p>

      <h2>4. Enlaces</h2>
      <p>
        La web puede contener enlaces a servicios de terceros (por ejemplo, el perfil del negocio
        en Google Maps). El titular no se hace responsable del contenido de esos sitios externos.
      </p>

      <h2>5. Protección de datos</h2>
      <p>
        El tratamiento de los datos personales de los usuarios se describe en la{" "}
        <a href="/legal/privacidad">política de privacidad</a>.
      </p>
    </LegalPage>
  );
}
